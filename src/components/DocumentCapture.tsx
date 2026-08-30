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

interface DocumentCaptureProps {
  bucket:
    | 'id-documents'
    | 'licenses'
    | 'kyc-documents';

  userId: string;

  label: string;

  onUploaded: (url: string) => void;

  currentUrl?: string;
}

type CaptureMode =
  | 'idle'
  | 'uploading'
  | 'camera'
  | 'preview';

export default function DocumentCapture({
  bucket,
  userId,
  label,
  onUploaded,
  currentUrl,
}: DocumentCaptureProps) {
  const [mode, setMode] =
    useState<CaptureMode>('idle');

  const [previewUrl, setPreviewUrl] =
    useState<string | null>(null);

  const [resolvingPreview, setResolvingPreview] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [cameraActive, setCameraActive] =
    useState(false);

  const [capturedBlob, setCapturedBlob] =
    useState<Blob | null>(null);

  const videoRef =
    useRef<HTMLVideoElement>(null);

  const canvasRef =
    useRef<HTMLCanvasElement>(null);

  const streamRef =
    useRef<MediaStream | null>(null);

  const fileInputRef =
    useRef<HTMLInputElement>(null);

  const objectUrlRef =
    useRef<string | null>(null);

  /*
  |--------------------------------------------------------------------------
  | CLEAN UP OBJECT URL
  |--------------------------------------------------------------------------
  */

  const revokeObjectUrl = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(
        objectUrlRef.current
      );

      objectUrlRef.current = null;
    }
  }, []);

  /*
  |--------------------------------------------------------------------------
  | RESOLVE STORED PATH -> FRESH SIGNED URL
  |
  | Values persisted via onUploaded are durable storage paths, not
  | URLs (see uploadFile below - this was previously the actual bug:
  | a 1-hour signed URL was being persisted directly and went dead).
  | When currentUrl comes back in as a bare path, resolve it here.
  | Uses the same /storage/... convention as upload - not a
  | /rest/v1/ path, so this deliberately does not go through
  | protectedApi/protectedGet/protectedPost (those enforce the
  | /rest/v1/ prefix).
  |--------------------------------------------------------------------------
  */

  const resolveSignedUrl = useCallback(
    async (path: string): Promise<string | null> => {
      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/protected-api/storage/sign`,
          {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({ bucket, path }),
          }
        );

        const result = await response.json().catch(() => null);

        if (!response.ok || !result?.url) {
          return null;
        }

        return result.url as string;
      } catch {
        return null;
      }
    },
    [bucket]
  );

  /*
  |--------------------------------------------------------------------------
  | STOP CAMERA
  |--------------------------------------------------------------------------
  */

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current
        .getTracks()
        .forEach((track) => {
          track.stop();
        });

      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }

    setCameraActive(false);
  }, []);

  /*
  |--------------------------------------------------------------------------
  | SYNC CURRENT URL
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    /*
     * Do not replace a local preview with currentUrl
     * while the user is actively selecting/capturing
     * a new document.
     */
    if (mode !== 'idle' || currentUrl === undefined) {
      return;
    }

    if (!currentUrl) {
      setPreviewUrl(null);
      setResolvingPreview(false);
      return;
    }

    // Already a displayable URL - either a signed URL passed in this
    // session, or (backward compat) a full URL persisted before this
    // fix. Nothing to resolve.
    if (
      currentUrl.startsWith('http://') ||
      currentUrl.startsWith('https://')
    ) {
      setPreviewUrl(currentUrl);
      setResolvingPreview(false);
      return;
    }

    // Bare storage path - the normal case going forward. Resolve it
    // to a fresh signed URL before displaying it.
    let cancelled = false;
    setResolvingPreview(true);

    resolveSignedUrl(currentUrl).then((url) => {
      if (cancelled) return;
      setPreviewUrl(url);
      setResolvingPreview(false);
    });

    return () => {
      cancelled = true;
    };
  }, [currentUrl, mode, resolveSignedUrl]);

  /*
  |--------------------------------------------------------------------------
  | COMPONENT CLEANUP
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    return () => {
      stopCamera();
      revokeObjectUrl();
    };
  }, [
    stopCamera,
    revokeObjectUrl,
  ]);

  /*
  |--------------------------------------------------------------------------
  | START CAMERA
  |--------------------------------------------------------------------------
  */

  const startCamera = async () => {
    setError(null);

    /*
     * Always stop an old stream first.
     */
    stopCamera();

    if (
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      setError(
        'Camera access is not supported on this device. Please upload an image instead.'
      );

      return;
    }

    try {
      const stream =
        await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: {
              ideal: 'environment',
            },
          },
          audio: false,
        });

      streamRef.current = stream;

      setCameraActive(true);
      setMode('camera');

      /*
       * Give React time to render the video element.
       */
      requestAnimationFrame(() => {
        const video =
          videoRef.current;

        if (!video) {
          stopCamera();
          setMode('idle');

          setError(
            'Unable to initialize the camera preview.'
          );

          return;
        }

        video.srcObject = stream;

        video
          .play()
          .catch(() => {
            /*
             * Some mobile browsers delay playback
             * until the user interacts with the
             * camera preview.
             */
          });
      });
    } catch (cameraError) {
      console.error(
        'Camera access failed:',
        cameraError
      );

      stopCamera();

      setMode('idle');

      setError(
        'Could not access the camera. Please allow camera permission or use Upload File instead.'
      );
    }
  };

  /*
  |--------------------------------------------------------------------------
  | CAPTURE PHOTO
  |--------------------------------------------------------------------------
  */

  const capturePhoto = () => {
    const video =
      videoRef.current;

    const canvas =
      canvasRef.current;

    if (!video || !canvas) {
      setError(
        'Camera is not ready yet. Please try again.'
      );

      return;
    }

    /*
     * Make sure the camera has actually
     * produced video dimensions.
     */
    if (
      video.readyState <
        HTMLMediaElement.HAVE_CURRENT_DATA ||
      video.videoWidth <= 0 ||
      video.videoHeight <= 0
    ) {
      setError(
        'Camera is still initializing. Please wait a moment and try again.'
      );

      return;
    }

    canvas.width =
      video.videoWidth;

    canvas.height =
      video.videoHeight;

    const context =
      canvas.getContext('2d');

    if (!context) {
      setError(
        'Unable to capture the photo.'
      );

      return;
    }

    context.drawImage(
      video,
      0,
      0,
      canvas.width,
      canvas.height
    );

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError(
            'Unable to create the captured image.'
          );

          return;
        }

        /*
         * Remove any previous temporary preview URL.
         */
        revokeObjectUrl();

        const objectUrl =
          URL.createObjectURL(blob);

        objectUrlRef.current =
          objectUrl;

        setCapturedBlob(blob);
        setPreviewUrl(objectUrl);

        /*
         * Stop camera immediately after
         * successfully capturing the image.
         */
        stopCamera();

        setMode('preview');
        setError(null);
      },
      'image/jpeg',
      0.9
    );
  };

  /*
  |--------------------------------------------------------------------------
  | FILE SELECTION
  |--------------------------------------------------------------------------
  */

  const handleFileSelect = (
    file: File
  ) => {
    setError(null);

    /*
     * Only accept actual image files.
     */
    if (!file.type.startsWith('image/')) {
      setError(
        'Please select an image file.'
      );

      return;
    }

    /*
     * Optional client-side size protection.
     *
     * 10 MB is large enough for normal phone
     * document photos while preventing accidental
     * huge files.
     */
    const maxSize =
      10 * 1024 * 1024;

    if (file.size > maxSize) {
      setError(
        'Image is too large. Please choose an image smaller than 10 MB.'
      );

      return;
    }

    /*
     * Release previous temporary object URL.
     */
    revokeObjectUrl();

    const objectUrl =
      URL.createObjectURL(file);

    objectUrlRef.current =
      objectUrl;

    setPreviewUrl(objectUrl);
    setCapturedBlob(file);
    setMode('preview');
  };

  /*
  |--------------------------------------------------------------------------
  | FILE INPUT CHANGE
  |--------------------------------------------------------------------------
  */

  const handleFileInputChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file =
      event.target.files?.[0];

    /*
     * Reset the input value immediately.
     *
     * This allows the user to select the same
     * file again after removing/replacing it.
     */
    event.target.value = '';

    if (!file) {
      return;
    }

    handleFileSelect(file);
  };

  /*
  |--------------------------------------------------------------------------
  | OPEN FILE PICKER
  |--------------------------------------------------------------------------
  */

  const openFilePicker = () => {
    setError(null);

    /*
     * IMPORTANT:
     *
     * This is deliberately the ONLY action performed
     * by the Upload File button.
     *
     * There is NO `capture="environment"` on the
     * input, so mobile browsers show the normal
     * image/file picker instead of forcing camera
     * capture.
     */
    fileInputRef.current?.click();
  };

  /*
  |--------------------------------------------------------------------------
  | UPLOAD
  |--------------------------------------------------------------------------
  */

  const uploadFile = async (
    file: File | Blob
  ) => {
    setMode('uploading');
    setError(null);

    try {
      /*
       * Determine extension.
       */
      let extension = 'jpg';

      if (file instanceof File) {
        const originalExtension =
          file.name
            .split('.')
            .pop()
            ?.toLowerCase();

        if (
          originalExtension &&
          /^[a-z0-9]+$/.test(
            originalExtension
          )
        ) {
          extension =
            originalExtension;
        }
      }

      /*
       * Normalize label.
       */
      const safeLabel =
        label
          .trim()
          .toLowerCase()
          .replace(
            /[^a-z0-9]+/g,
            '-'
          )
          .replace(
            /^-+|-+$/g,
            ''
          ) || 'document';

      /*
       * Unique storage path.
       *
       * userId/
       *   document-label-timestamp-random.ext
       */
      const randomPart =
        Math.random()
          .toString(36)
          .slice(2, 10);

      const fileName =
        `${userId}/${safeLabel}-${Date.now()}-${randomPart}.${extension}`;

      /*
       * Upload through the protected API.
       *
       * The browser no longer performs a direct
       * Supabase Storage upload.
       */
      const formData =
        new FormData();

      formData.append(
        'file',
        file,
        fileName
      );

      formData.append(
        'bucket',
        bucket
      );

      formData.append(
        'path',
        fileName
      );

      const response =
        await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/protected-api/storage/upload`,
          {
            method: 'POST',
            credentials: 'include',
            headers: {
              apikey:
                import.meta.env
                  .VITE_SUPABASE_ANON_KEY,
            },
            body: formData,
          }
        );

      const result =
        await response.json();

      if (!response.ok) {
        throw new Error(
          result?.error ||
            result?.message ||
            'Document upload failed.'
        );
      }

      const publicUrl =
        result.url ||
        result.publicUrl;

      const storagePath = result.path;

      if (!publicUrl || !storagePath) {
        throw new Error(
          'The document was uploaded but its details could not be confirmed.'
        );
      }

      /*
       * Remove temporary local preview.
       */
      revokeObjectUrl();

      /*
       * Tell the parent form about the persisted document. This is
       * the durable storage PATH, not the signed URL - the signed
       * URL expires in 1 hour and must never be what gets saved to
       * a DB column. Parent forms should pass this same value back
       * in as `currentUrl` on reload; this component resolves it to
       * a fresh signed URL for display itself.
       */
      onUploaded(storagePath);

      setPreviewUrl(publicUrl);
      setCapturedBlob(null);
      setMode('idle');
      setError(null);
    } catch (uploadError) {
      console.error(
        'Document upload failed:',
        uploadError
      );

      setError(
        uploadError instanceof Error
          ? uploadError.message
          : 'Upload failed. Please try again.'
      );

      /*
       * Keep the preview so the user can
       * retry without selecting/capturing
       * the document again.
       */
      setMode('preview');
    }
  };

  /*
  |--------------------------------------------------------------------------
  | RESET
  |--------------------------------------------------------------------------
  */

  const reset = () => {
    stopCamera();
    revokeObjectUrl();

    setPreviewUrl(null);
    setCapturedBlob(null);
    setError(null);
    setMode('idle');

    /*
     * Clear the persisted parent value.
     */
    onUploaded('');
  };

  /*
  |--------------------------------------------------------------------------
  | CAMERA CANCEL
  |--------------------------------------------------------------------------
  */

  const cancelCamera = () => {
    stopCamera();
    setMode('idle');
    setError(null);
  };

  /*
  |--------------------------------------------------------------------------
  | UPLOADING
  |--------------------------------------------------------------------------
  */

  if (mode === 'uploading') {
    return (
      <div className="flex h-40 flex-col items-center justify-center rounded-xl border-2 border-brand-300 bg-brand-50 dark:border-brand-600 dark:bg-brand-800/30">
        <RefreshCw className="h-8 w-8 animate-spin text-brand-500" />

        <p className="mt-2 text-sm font-medium text-brand-600 dark:text-brand-400">
          Uploading {label}...
        </p>
      </div>
    );
  }

  /*
  |--------------------------------------------------------------------------
  | CAMERA
  |--------------------------------------------------------------------------
  */

  if (
    mode === 'camera' &&
    cameraActive
  ) {
    return (
      <div className="overflow-hidden rounded-xl border-2 border-brand-300 dark:border-brand-600">
        <div className="relative bg-black">
          <video
            ref={videoRef}
            className="h-64 w-full object-cover sm:h-80"
            playsInline
            muted
            autoPlay
          />

          <button
            type="button"
            onClick={cancelCamera}
            aria-label="Close camera"
            className="absolute right-2 top-2 rounded-full bg-error-600 p-2 text-white shadow-lg"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <p className="bg-error-50 px-3 py-2 text-center text-xs text-error-600 dark:bg-error-900/20 dark:text-error-400">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-2 bg-white p-3 dark:bg-brand-900 sm:flex-row sm:items-center sm:justify-center">
          <button
            type="button"
            onClick={capturePhoto}
            className="btn-primary inline-flex items-center justify-center gap-2"
          >
            <Camera className="h-4 w-4" />
            Capture Photo
          </button>

          <button
            type="button"
            onClick={cancelCamera}
            className="btn-secondary inline-flex items-center justify-center gap-2"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  /*
  |--------------------------------------------------------------------------
  | PREVIEW BEFORE SAVE
  |--------------------------------------------------------------------------
  */

  if (
    mode === 'preview' &&
    previewUrl
  ) {
    return (
      <div className="rounded-xl border-2 border-success-300 dark:border-success-600">
        <div className="relative bg-gray-100 dark:bg-brand-900">
          <img
            src={previewUrl}
            alt={label}
            className="h-48 w-full rounded-t-xl object-contain"
          />

          <button
            type="button"
            onClick={reset}
            aria-label={`Remove ${label}`}
            className="absolute right-2 top-2 rounded-full bg-error-600 p-1.5 text-white shadow-md"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-2 bg-success-50 px-3 py-3 dark:bg-success-900/20 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-1.5 text-sm font-medium text-success-700 dark:text-success-400">
            <CheckCircle2 className="h-4 w-4 shrink-0" />

            Ready to upload
          </p>

          <button
            type="button"
            onClick={() => {
              if (capturedBlob) {
                void uploadFile(
                  capturedBlob
                );
              }
            }}
            disabled={!capturedBlob}
            className="btn-primary text-xs disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save {label}
          </button>
        </div>

        {error && (
          <p className="px-3 py-2 text-xs text-error-600 dark:text-error-400">
            {error}
          </p>
        )}
      </div>
    );
  }

  /*
  |--------------------------------------------------------------------------
  | RESOLVING EXISTING DOCUMENT
  |
  | currentUrl was a stored path and resolveSignedUrl hasn't returned
  | yet - show a lightweight loading state instead of nothing, rather
  | than briefly rendering as if no document exists.
  |--------------------------------------------------------------------------
  */

  if (mode === 'idle' && resolvingPreview) {
    return (
      <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 py-10 dark:border-brand-700 dark:bg-brand-900">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  /*
  |--------------------------------------------------------------------------
  | ALREADY UPLOADED
  |--------------------------------------------------------------------------
  */

  if (
    previewUrl &&
    mode === 'idle'
  ) {
    return (
      <div className="rounded-xl border-2 border-success-300 dark:border-success-600">
        <div className="relative bg-gray-100 dark:bg-brand-900">
          <img
            src={previewUrl}
            alt={label}
            className="h-48 w-full rounded-t-xl object-contain"
          />

          <button
            type="button"
            onClick={reset}
            aria-label={`Remove ${label}`}
            className="absolute right-2 top-2 rounded-full bg-error-600 p-1.5 text-white shadow-md"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center justify-center gap-2 bg-success-50 px-3 py-3 dark:bg-success-900/20">
          <CheckCircle2 className="h-4 w-4 text-success-600" />

          <p className="text-sm font-medium text-success-700 dark:text-success-400">
            {label} uploaded
          </p>
        </div>
      </div>
    );
  }

  /*
  |--------------------------------------------------------------------------
  | INITIAL CAPTURE UI
  |--------------------------------------------------------------------------
  */

  return (
    <div className="rounded-xl border-2 border-dashed border-gray-300 p-4 dark:border-brand-700">
      <p className="mb-3 text-center text-sm font-medium text-gray-500 dark:text-gray-400">
        {label}
      </p>

      <div className="flex flex-col gap-2 sm:flex-row">
        {/*
         * IMPORTANT:
         *
         * This button MUST be type="button".
         *
         * Without it, because DocumentCapture is inside
         * RegisterMoverPage's <form>, mobile browsers can
         * submit the entire form after opening the picker.
         */}
        <button
          type="button"
          onClick={openFilePicker}
          className={cn(
            'flex flex-1 flex-col items-center justify-center gap-1.5 rounded-lg border border-gray-200 py-4 transition-colors',
            'hover:border-brand-400 hover:bg-brand-50',
            'dark:border-brand-700 dark:hover:border-brand-500 dark:hover:bg-brand-800/30'
          )}
        >
          <Upload className="h-6 w-6 text-gray-400" />

          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
            Upload File
          </span>

          <span className="text-[10px] text-gray-400 dark:text-gray-500">
            Choose from device
          </span>
        </button>

        {/*
         * Camera is completely separate from file upload.
         */}
        <button
          type="button"
          onClick={() => {
            void startCamera();
          }}
          className={cn(
            'flex flex-1 flex-col items-center justify-center gap-1.5 rounded-lg border border-gray-200 py-4 transition-colors',
            'hover:border-brand-400 hover:bg-brand-50',
            'dark:border-brand-700 dark:hover:border-brand-500 dark:hover:bg-brand-800/30'
          )}
        >
          <Camera className="h-6 w-6 text-gray-400" />

          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
            Take Photo
          </span>

          <span className="text-[10px] text-gray-400 dark:text-gray-500">
            Use camera
          </span>
        </button>
      </div>

      {error && (
        <p className="mt-2 text-center text-xs text-error-600 dark:text-error-400">
          {error}
        </p>
      )}

      {/*
       * IMPORTANT:
       *
       * There is intentionally NO:
       *
       * capture="environment"
       *
       * here.
       *
       * That attribute can cause mobile browsers to
       * turn the file picker into a camera action.
       *
       * "Upload File" should mean gallery/files.
       * "Take Photo" should mean camera.
       */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileInputChange}
      />

      <canvas
        ref={canvasRef}
        className="hidden"
      />
    </div>
  );
};