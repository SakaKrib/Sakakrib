import { useEffect, useState, type ImgHTMLAttributes, type ReactNode } from 'react';
import { ImageOff } from 'lucide-react';
import { protectedBlob, resolveDjangoMediaUrl } from '@/lib/djangoApi';

/** Authenticated images already fetched this session, keyed by API path. */
const blobCache = new Map<string, string>();

interface SecureImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  src?: string | null;
  /** Shown when there is no image or it cannot be loaded. */
  fallback?: ReactNode;
}

/** The /api/... path of a Django-hosted media URL, or null for blob:/data:/external URLs. */
function apiPathOf(resolved: string): string | null {
  if (!resolved || /^(blob:|data:)/i.test(resolved)) return null;
  try {
    const parsed = new URL(resolved, window.location.origin);
    return parsed.pathname.startsWith('/api/') ? `${parsed.pathname}${parsed.search}` : null;
  } catch {
    return resolved.startsWith('/api/') ? resolved : null;
  }
}

/**
 * <img> that works for every kind of listing image, including drafts and pending listings.
 *
 * Why: draft/pending listing photos are private, and a plain <img> cannot send the login
 * session reliably (especially inside the Android WebView, or when the URL carries the wrong
 * host). So the preview used to stay blank.
 *
 * 1. blob:/data: previews (a file just picked) are shown as they are.
 * 2. Django media is first loaded directly from the configured API host (works for public images).
 * 3. If that fails, the file is fetched through the authenticated API client and shown from a blob.
 * 4. If that fails too, a neutral placeholder is shown instead of a broken image.
 */
export default function SecureImage({ src, alt = '', className, fallback, onError, ...rest }: SecureImageProps) {
  const resolved = resolveDjangoMediaUrl(src);
  const apiPath = apiPathOf(resolved);
  const [shown, setShown] = useState(resolved);
  const [triedBlob, setTriedBlob] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setShown(apiPath && blobCache.has(apiPath) ? blobCache.get(apiPath)! : resolved);
    setTriedBlob(false);
    setFailed(false);
  }, [resolved, apiPath]);

  const handleError: ImgHTMLAttributes<HTMLImageElement>['onError'] = (event) => {
    onError?.(event);
    if (apiPath && !triedBlob) {
      setTriedBlob(true);
      protectedBlob(apiPath)
        .then((blob) => {
          const objectUrl = URL.createObjectURL(blob);
          blobCache.set(apiPath, objectUrl);
          setShown(objectUrl);
        })
        .catch(() => setFailed(true));
      return;
    }
    setFailed(true);
  };

  if (!resolved || failed) {
    return (
      <>
        {fallback ?? (
          <div
            className={`flex items-center justify-center bg-gray-100 text-gray-400 dark:bg-brand-800 ${className ?? ''}`}
            role="img"
            aria-label={alt || 'Image unavailable'}
          >
            <ImageOff className="h-6 w-6" />
          </div>
        )}
      </>
    );
  }

  return <img {...rest} src={shown} alt={alt} className={className} loading={rest.loading ?? 'lazy'} onError={handleError} />;
}
