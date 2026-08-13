import { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, Camera, CheckCircle2, X, RefreshCw, Image as ImageIcon } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

interface DocumentCaptureProps {
  bucket: 'id-documents' | 'licenses' | 'kyc-documents';
  userId: string;
  label: string;
  onUploaded: (url: string) => void;
  currentUrl?: string;
}

export default function DocumentCapture({ bucket, userId, label, onUploaded, currentUrl }: DocumentCaptureProps) {
  const [mode, setMode] = useState<'idle' | 'uploading' | 'camera' | 'preview'>('idle');
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentUrl || null);
  const [error, setError] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  const startCamera = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);
      setMode('camera');
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 100);
    } catch {
      setError('Could not access camera. Use upload instead.');
      setCameraActive(false);
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (blob) {
        setCapturedBlob(blob);
        setPreviewUrl(URL.createObjectURL(blob));
        setMode('preview');
      }
    }, 'image/jpeg', 0.9);
    stopCamera();
  };

  const handleFileSelect = (file: File) => {
    setError(null);
    setPreviewUrl(URL.createObjectURL(file));
    setCapturedBlob(file);
    setMode('preview');
  };

  const uploadFile = async (file: File | Blob) => {
    setMode('uploading');
    setError(null);
    try {
      const ext = file instanceof File ? file.name.split('.').pop() : 'jpg';
      const fileName = `${userId}/${label.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(fileName, file);
      if (uploadError) {
        if (uploadError.message.includes('not found') || uploadError.message.includes('bucket')) {
          throw new Error('Storage not configured. Please contact support.');
        }
        throw uploadError;
      }
      const { data: { publicUrl } } = supabase.storage
        .from(bucket)
        .getPublicUrl(fileName);
      onUploaded(publicUrl);
      setPreviewUrl(publicUrl);
      setMode('idle');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
      setMode('preview');
    }
  };

  const reset = () => {
    setPreviewUrl(null);
    setCapturedBlob(null);
    setError(null);
    setMode('idle');
    onUploaded('');
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
          <video ref={videoRef} className="h-48 w-full object-cover" playsInline muted />
          <button
            onClick={() => { stopCamera(); setMode('idle'); }}
            className="absolute right-2 top-2 rounded-full bg-error-600 p-1.5 text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center justify-center gap-3 bg-white p-3 dark:bg-brand-900">
          <button onClick={capturePhoto} className="btn-primary">
            <Camera className="h-4 w-4" /> Capture Photo
          </button>
          <button onClick={() => { stopCamera(); setMode('idle'); }} className="btn-secondary">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'preview' && previewUrl) {
    return (
      <div className="rounded-xl border-2 border-success-300 dark:border-success-600">
        <div className="relative">
          <img src={previewUrl} alt={label} className="h-40 w-full rounded-t-xl object-cover" />
          <button onClick={reset} className="absolute right-2 top-2 rounded-full bg-error-600 p-1.5 text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center justify-between bg-success-50 px-3 py-2 dark:bg-success-900/20">
          <p className="flex items-center gap-1.5 text-sm font-medium text-success-700 dark:text-success-400">
            <CheckCircle2 className="h-4 w-4" /> Ready to upload
          </p>
          <button
            onClick={() => capturedBlob && uploadFile(capturedBlob)}
            className="btn-primary text-xs"
          >
            Save {label}
          </button>
        </div>
        {error && (
          <p className="px-3 py-1.5 text-xs text-error-600 dark:text-error-400">{error}</p>
        )}
      </div>
    );
  }

  if (previewUrl && mode === 'idle') {
    return (
      <div className="rounded-xl border-2 border-success-300 dark:border-success-600">
        <div className="relative">
          <img src={previewUrl} alt={label} className="h-40 w-full rounded-t-xl object-cover" />
          <button onClick={reset} className="absolute right-2 top-2 rounded-full bg-error-600 p-1.5 text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center justify-center gap-2 bg-success-50 px-3 py-2 dark:bg-success-900/20">
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
        <button
          onClick={() => fileInputRef.current?.click()}
          className={cn('flex flex-1 flex-col items-center justify-center gap-1.5 rounded-lg border border-gray-200 py-4 transition-colors hover:border-brand-400 hover:bg-brand-50 dark:border-brand-700 dark:hover:border-brand-500 dark:hover:bg-brand-800/30')}
        >
          <Upload className="h-6 w-6 text-gray-400" />
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Upload File</span>
        </button>
        <button
          onClick={startCamera}
          className="flex flex-1 flex-col items-center justify-center gap-1.5 rounded-lg border border-gray-200 py-4 transition-colors hover:border-brand-400 hover:bg-brand-50 dark:border-brand-700 dark:hover:border-brand-500 dark:hover:bg-brand-800/30"
        >
          <Camera className="h-6 w-6 text-gray-400" />
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Take Photo</span>
        </button>
      </div>
      {error && (
        <p className="mt-2 text-center text-xs text-error-600 dark:text-error-400">{error}</p>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileSelect(file);
        }}
      />
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
