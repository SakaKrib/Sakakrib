import {
  useState,
  useRef,
  useCallback,
  useEffect,
} from 'react';

import {
  Upload,
  Camera,
  CheckCircle2,
  X,
  RefreshCw,
  Loader2,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { protectedBlob, protectedUpload } from '@/lib/djangoApi';

interface DocumentCaptureProps {
  bucket: 'id-documents' | 'licenses' | 'kyc-documents';
  userId: string;
  label: string;
  onUploaded: (path: string) => void;
  currentUrl?: string;
}

type CaptureMode = 'idle' | 'uploading' | 'camera' | 'preview';

const getStoragePath = (value: string, bucket: DocumentCaptureProps['bucket']): string => {
  let path = value.trim();
  if (!path) return '';

  // Current Django representation.
  if (path.startsWith('django-media://')) {
    return path.slice('django-media://'.length).replace(/^\/+/, '').split('?')[0];
  }

  // Current private-document API URL. Only the path parameter is retained;
  // any query credentials from an older implementation are discarded.
  try {
    const parsed = new URL(path, window.location.origin);
    const queryPath = parsed.searchParams.get('path');
    if (queryPath) return decodeURIComponent(queryPath).replace(/^\/+/, '');

    // Legacy Supabase storage URL: keep only the object path if encountered.
    const markers = [
      `/storage/v1/object/public/${bucket}/`,
      `/storage/v1/object/sign/${bucket}/`,
    ];
    for (const marker of markers) {
      const markerIndex = parsed.pathname.indexOf(marker);
      if (markerIndex >= 0) {
        return parsed.pathname.slice(markerIndex + marker.length).replace(/^\/+/, '');
      }
    }

    // Do not render arbitrary remote URLs. They may contain old signed
    // credentials such as access_token/signature query parameters.
    if (parsed.origin === window.location.origin && parsed.pathname.includes('/api/accounts/documents/view/')) {
      return '';
    }
  } catch {
    // Fall through to the plain storage-path case below.
  }

  return path.split('?')[0].replace(/^\/+/, '');
};

export default function DocumentCapture({
  bucket,
  userId,
  label,
  onUploaded,
  currentUrl,
}: DocumentCaptureProps) {
  const [mode, setMode] = useState<CaptureMode>('idle');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [resolvingPreview, setResolvingPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);

  const revokeObjectUrl = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  const loadStoredPreview = useCallback(async (storedValue: string) => {
    const path = getStoragePath(storedValue, bucket);
    if (!path) {
      setPreviewUrl(null);
      setError('This document needs to be uploaded again before it can be previewed securely.');
      return;
    }

    setResolvingPreview(true);
    setError(null);
    revokeObjectUrl();

    try {
      const blob = await protectedBlob(
        `/api/accounts/documents/view/?bucket=${encodeURIComponent(bucket)}&path=${encodeURIComponent(path)}`,
      );
      const objectUrl = URL.createObjectURL(blob);
      objectUrlRef.current = objectUrl;
      setPreviewUrl(objectUrl);
    } catch (previewError) {
      console.error('Document preview failed:', previewError);
      setPreviewUrl(null);
      setError('We could not open this document securely. Please upload it again.');
    } finally {
      setResolvingPreview(false);
    }
  }, [bucket, revokeObjectUrl]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, []);

  useEffect(() => {
    if (mode !== 'idle' || currentUrl === undefined) return;

    if (!currentUrl) {
      revokeObjectUrl();
      setPreviewUrl(null);
      setResolvingPreview(false);
      setError(null);
      return;
    }

    let cancelled = false;
    void loadStoredPreview(currentUrl).then(() => {
      if (cancelled) return;
    });

    return () => {
      cancelled = true;
    };
  }, [currentUrl, mode, loadStoredPreview, revokeObjectUrl]);

  useEffect(() => () => {
    stopCamera();
    revokeObjectUrl();
  }, [stopCamera, revokeObjectUrl]);

  const startCamera = async () => {
    setError(null);
    stopCamera();

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera access is not supported on this device. Please upload an image instead.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);
      setMode('camera');

      requestAnimationFrame(() => {
        const video = videoRef.current;
        if (!video) {
          stopCamera();
          setMode('idle');
          setError('Unable to initialize the camera preview.');
          return;
        }
        video.srcObject = stream;
        video.play().catch(() => undefined);
      });
    } catch (cameraError) {
      console.error('Camera access failed:', cameraError);
      stopCamera();
      setMode('idle');
      setError('Could not access the camera. Please allow camera permission or use Upload File instead.');
    }
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) {
      setError('Camera is not ready yet. Please try again.');
      return;
    }
    if (
      video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
      video.videoWidth <= 0 ||
      video.videoHeight <= 0
    ) {
      setError('Camera is still initializing. Please wait a moment and try again.');
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      setError('Unable to capture the photo.');
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) {
        setError('Unable to create the captured image.');
        return;
      }
      revokeObjectUrl();
      const objectUrl = URL.createObjectURL(blob);
      objectUrlRef.current = objectUrl;
      setCapturedBlob(blob);
      setPreviewUrl(objectUrl);
      stopCamera();
      setMode('preview');
      setError(null);
    }, 'image/jpeg', 0.9);
  };

  const handleFileSelect = (file: File) => {
    setError(null);
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Image is too large. Please choose an image smaller than 10 MB.');
      return;
    }
    revokeObjectUrl();
    const objectUrl = URL.createObjectURL(file);
    objectUrlRef.current = objectUrl;
    setPreviewUrl(objectUrl);
    setCapturedBlob(file);
    setMode('preview');
  };

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) handleFileSelect(file);
  };

  const uploadFile = async (file: File | Blob) => {
    setMode('uploading');
    setError(null);

    try {
      let extension = 'jpg';
      if (file instanceof File) {
        const originalExtension = file.name.split('.').pop()?.toLowerCase();
        if (originalExtension && /^[a-z0-9]+$/.test(originalExtension)) {
          extension = originalExtension;
        }
      }

      const safeLabel = label
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'document';
      const randomPart = Math.random().toString(36).slice(2, 10);
      const fileName = `${userId}/${safeLabel}-${Date.now()}-${randomPart}.${extension}`;

      const formData = new FormData();
      formData.append('file', file, fileName);
      formData.append('bucket', bucket);
      formData.append('path', fileName);

      const result = await protectedUpload<{
        path?: string;
        bucket?: string;
        size?: number;
        mime_type?: string;
      }>('/api/accounts/documents/upload/', formData);

      const storagePath = result?.path;
      if (!storagePath) {
        throw new Error('The document was uploaded but its storage path could not be confirmed.');
      }

      // Persist only the durable Django storage path. The access token remains
      // in an HttpOnly cookie and is never placed in an image/document URL.
      onUploaded(storagePath);

      // Preview the uploaded bytes through Django. The browser receives a
      // temporary object URL, not a credential-bearing remote URL.
      revokeObjectUrl();
      const blob = await protectedBlob(
        `/api/accounts/documents/view/?bucket=${encodeURIComponent(bucket)}&path=${encodeURIComponent(storagePath)}`,
      );
      const objectUrl = URL.createObjectURL(blob);
      objectUrlRef.current = objectUrl;
      setPreviewUrl(objectUrl);
      setCapturedBlob(null);
      setMode('idle');
    } catch (uploadError) {
      console.error('Document upload failed:', uploadError);
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : 'Upload failed. Please try again.',
      );
      setMode('preview');
    }
  };

  const reset = () => {
    stopCamera();
    revokeObjectUrl();
    setPreviewUrl(null);
    setCapturedBlob(null);
    setError(null);
    setMode('idle');
    onUploaded('');
  };

  const cancelCamera = () => {
    stopCamera();
    setMode('idle');
    setError(null);
  };

  if (mode === 'uploading') {
    return (
      <div className="flex h-40 flex-col items-center justify-center rounded-xl border-2 border-brand-300 bg-brand-50 dark:border-brand-600 dark:bg-brand-800/30">
        <RefreshCw className="h-8 w-8 animate-spin text-brand-500" />
        <p className="mt-2 text-sm font-medium text-brand-600 dark:text-brand-400">Uploading {label}...</p>
      </div>
    );
  }

  if (mode === 'camera' && cameraActive) {
    return (
      <div className="overflow-hidden rounded-xl border-2 border-brand-300 dark:border-brand-600">
        <div className="relative bg-black">
          <video ref={videoRef} className="h-64 w-full object-cover sm:h-80" playsInline muted autoPlay />
          <button type="button" onClick={cancelCamera} aria-label="Close camera" className="absolute right-2 top-2 rounded-full bg-error-600 p-2 text-white shadow-lg">
            <X className="h-4 w-4" />
          </button>
        </div>
        {error && <p className="bg-error-50 px-3 py-2 text-center text-xs text-error-600 dark:bg-error-900/20 dark:text-error-400">{error}</p>}
        <div className="flex flex-col gap-2 bg-white p-3 dark:bg-brand-900 sm:flex-row sm:items-center sm:justify-center">
          <button type="button" onClick={capturePhoto} className="btn-primary inline-flex items-center justify-center gap-2"><Camera className="h-4 w-4" />Capture Photo</button>
          <button type="button" onClick={cancelCamera} className="btn-secondary inline-flex items-center justify-center gap-2">Cancel</button>
        </div>
      </div>
    );
  }

  if (mode === 'preview' && previewUrl) {
    return (
      <div className="rounded-xl border-2 border-success-300 dark:border-success-600">
        <div className="relative bg-gray-100 dark:bg-brand-900">
          <img src={previewUrl} alt={label} className="h-48 w-full rounded-t-xl object-contain" />
          <button type="button" onClick={reset} aria-label={`Remove ${label}`} className="absolute right-2 top-2 rounded-full bg-error-600 p-1.5 text-white shadow-md"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex flex-col gap-2 bg-success-50 px-3 py-3 dark:bg-success-900/20 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-1.5 text-sm font-medium text-success-700 dark:text-success-400"><CheckCircle2 className="h-4 w-4 shrink-0" />Ready to upload</p>
          <button type="button" onClick={() => capturedBlob && void uploadFile(capturedBlob)} disabled={!capturedBlob} className="btn-primary text-xs disabled:cursor-not-allowed disabled:opacity-50">Save {label}</button>
        </div>
        {error && <p className="px-3 py-2 text-xs text-error-600 dark:text-error-400">{error}</p>}
      </div>
    );
  }

  if (mode === 'idle' && resolvingPreview) {
    return (
      <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 py-10 dark:border-brand-700 dark:bg-brand-900">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  if (previewUrl && mode === 'idle') {
    return (
      <div className="rounded-xl border-2 border-success-300 dark:border-success-600">
        <div className="relative bg-gray-100 dark:bg-brand-900">
          <img src={previewUrl} alt={label} className="h-48 w-full rounded-t-xl object-contain" />
          <button type="button" onClick={reset} aria-label={`Remove ${label}`} className="absolute right-2 top-2 rounded-full bg-error-600 p-1.5 text-white shadow-md"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex items-center justify-center gap-2 bg-success-50 px-3 py-3 dark:bg-success-900/20">
          <CheckCircle2 className="h-4 w-4 text-success-600" />
          <p className="text-sm font-medium text-success-700 dark:text-success-400">{label} uploaded</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border-2 border-dashed border-gray-300 p-4 dark:border-brand-700">
      <p className="mb-3 text-center text-sm font-medium text-gray-500 dark:text-gray-400">{label}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="button" onClick={() => fileInputRef.current?.click()} className={cn('flex flex-1 flex-col items-center justify-center gap-1.5 rounded-lg border border-gray-200 py-4 transition-colors', 'hover:border-brand-400 hover:bg-brand-50', 'dark:border-brand-700 dark:hover:border-brand-500 dark:hover:bg-brand-800/30')}>
          <Upload className="h-6 w-6 text-gray-400" />
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Upload File</span>
          <span className="text-[10px] text-gray-400 dark:text-gray-500">Choose from device</span>
        </button>
        <button type="button" onClick={() => void startCamera()} className={cn('flex flex-1 flex-col items-center justify-center gap-1.5 rounded-lg border border-gray-200 py-4 transition-colors', 'hover:border-brand-400 hover:bg-brand-50', 'dark:border-brand-700 dark:hover:border-brand-500 dark:hover:bg-brand-800/30')}>
          <Camera className="h-6 w-6 text-gray-400" />
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Take Photo</span>
          <span className="text-[10px] text-gray-400 dark:text-gray-500">Use camera</span>
        </button>
      </div>
      {error && <p className="mt-2 text-center text-xs text-error-600 dark:text-error-400">{error}</p>}
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileInputChange} />
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
