// Private document opener backed by Django authentication and storage.
// The browser never receives storage credentials or signed URL tokens.

import { protectedBlob } from '@/lib/djangoApi';

type DocumentType = 'id' | 'selfie';

const ALLOWED_BUCKETS = [
  'id-documents',
  'licenses',
  'kyc-documents',
] as const;

type AllowedBucket = (typeof ALLOWED_BUCKETS)[number];

const normalizeDocumentPath = (
  documentPath: string,
): { bucket: AllowedBucket; path: string } | null => {
  let value = documentPath.trim();
  if (!value) return null;

  try {
    const parsed = new URL(value, window.location.origin);
    const queryBucket = parsed.searchParams.get('bucket');
    const queryPath = parsed.searchParams.get('path');
    if (queryPath) {
      const bucket = (queryBucket || 'kyc-documents') as AllowedBucket;
      if (!ALLOWED_BUCKETS.includes(bucket)) return null;
      return {
        bucket,
        path: decodeURIComponent(queryPath).replace(/^\/+/, '').split('?')[0],
      };
    }

    const legacyStorageMatch = parsed.pathname.match(
      /\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/,
    );
    if (legacyStorageMatch) {
      const bucket = legacyStorageMatch[1] as AllowedBucket;
      if (!ALLOWED_BUCKETS.includes(bucket)) return null;
      return { bucket, path: legacyStorageMatch[2].replace(/^\/+/, '') };
    }
  } catch {
    // Treat the value as a storage path below.
  }

  value = value.split('?')[0].split('#')[0].replace(/^\/+/, '');
  for (const bucket of ALLOWED_BUCKETS) {
    const prefix = `${bucket}/`;
    if (value.startsWith(prefix)) {
      return { bucket, path: value.slice(prefix.length) };
    }
  }

  return { bucket: 'kyc-documents', path: value };
};

export default async function openKycDocument(
  documentPath: string | null | undefined,
  documentType: DocumentType = 'id',
): Promise<string | null> {
  if (!documentPath) {
    return documentType === 'selfie'
      ? 'Verification selfie is not available.'
      : 'ID document is not available.';
  }

  const normalized = normalizeDocumentPath(documentPath);
  if (!normalized || !normalized.path || normalized.path.split('/').includes('..')) {
    return 'Invalid document path.';
  }

  try {
    const blob = await protectedBlob(
      `/api/accounts/documents/view/?bucket=${encodeURIComponent(normalized.bucket)}&path=${encodeURIComponent(normalized.path)}`,
    );
    const objectUrl = URL.createObjectURL(blob);
    const newWindow = window.open(objectUrl, '_blank', 'noopener,noreferrer');

    if (!newWindow) {
      URL.revokeObjectURL(objectUrl);
      return 'The document could not be opened. Please allow pop-ups for this site.';
    }

    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    return null;
  } catch (error) {
    console.error('Unexpected private document error:', error);
    return 'Unable to open the document.';
  }
}
