// ============================================================
// OPEN PRIVATE STORAGE DOCUMENT
//
// Django-only private document viewer. Authentication is carried
// by the HttpOnly cookie; the document URL contains only a storage
// path and never an access/signing token.
// ============================================================

import { protectedBlob } from '@/lib/djangoApi';

const ALLOWED_BUCKETS = [
  'id-documents',
  'licenses',
  'kyc-documents',
] as const;

type AllowedBucket = (typeof ALLOWED_BUCKETS)[number];

const extractStoragePath = (
  documentPath: string,
  bucketName: AllowedBucket,
): string => {
  let value = documentPath.trim();
  if (!value) return '';

  if (value.startsWith('django-media://')) {
    return value.slice('django-media://'.length).replace(/^\/+/, '').split('?')[0];
  }

  try {
    const parsed = new URL(value, window.location.origin);
    const queryPath = parsed.searchParams.get('path');
    if (queryPath) return decodeURIComponent(queryPath).replace(/^\/+/, '');

    const markers = [
      `/storage/v1/object/public/${bucketName}/`,
      `/storage/v1/object/sign/${bucketName}/`,
    ];
    for (const marker of markers) {
      const index = parsed.pathname.indexOf(marker);
      if (index >= 0) {
        return parsed.pathname.slice(index + marker.length).replace(/^\/+/, '');
      }
    }
  } catch {
    // Treat non-URL input as a storage path below.
  }

  return value.split('?')[0].replace(/^\/+/, '');
};

export const openStorageDocument = async (
  documentPath: string | null | undefined,
  bucketName: string = 'id-documents',
): Promise<boolean> => {
  if (!documentPath) {
    console.error('Storage document path is missing.');
    return false;
  }

  if (!ALLOWED_BUCKETS.includes(bucketName as AllowedBucket)) {
    console.error('Unsupported storage bucket for document viewing:', bucketName);
    return false;
  }

  const bucket = bucketName as AllowedBucket;
  const path = extractStoragePath(documentPath, bucket);
  if (!path || path.split('/').includes('..')) {
    console.error('Invalid storage document path.');
    return false;
  }

  try {
    const blob = await protectedBlob(
      `/api/accounts/documents/view/?bucket=${encodeURIComponent(bucket)}&path=${encodeURIComponent(path)}`,
    );
    const objectUrl = URL.createObjectURL(blob);
    const newWindow = window.open(objectUrl, '_blank', 'noopener,noreferrer');

    if (!newWindow) {
      URL.revokeObjectURL(objectUrl);
      console.error('Browser blocked the document window.');
      return false;
    }

    // Keep the object URL alive while the new tab consumes the blob.
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    return true;
  } catch (error) {
    console.error('Unexpected storage document error:', error);
    return false;
  }
};

export default openStorageDocument;
