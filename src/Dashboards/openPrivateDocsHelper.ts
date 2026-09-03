// Private document opener backed by Django authentication and storage.
// The browser never receives storage credentials. Django authorizes the
// requester and returns a short-lived signed document URL.

import { protectedPost } from '@/lib/djangoApi';

type DocumentType = 'id' | 'selfie';

const ALLOWED_BUCKETS = [
  'id-documents',
  'licenses',
  'kyc-documents',
] as const;

type AllowedBucket = (typeof ALLOWED_BUCKETS)[number];

export default async function openKycDocument(
  documentPath: string | null | undefined,
  documentType: DocumentType = 'id'
): Promise<string | null> {
  if (!documentPath) {
    return documentType === 'selfie'
      ? 'Verification selfie is not available.'
      : 'ID document is not available.';
  }

  try {
    let value = documentPath.trim();
    if (!value) return 'Invalid document path.';

    let bucket: AllowedBucket = 'kyc-documents';
    let path = value.split('?')[0].split('#')[0].replace(/^\/+/, '');

    // Preserve compatibility with previously stored object URLs while
    // the data migration is completed. No Supabase client or network call
    // is used for these legacy values.
    const legacyStorageMatch = path.match(
      /\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/
    );
    if (legacyStorageMatch) {
      const candidateBucket = legacyStorageMatch[1] as AllowedBucket;
      if (ALLOWED_BUCKETS.includes(candidateBucket)) {
        bucket = candidateBucket;
        path = legacyStorageMatch[2];
      }
    }

    for (const knownBucket of ALLOWED_BUCKETS) {
      const prefix = `${knownBucket}/`;
      if (path.startsWith(prefix)) {
        bucket = knownBucket;
        path = path.substring(prefix.length);
        break;
      }
    }

    if (path.startsWith(`${bucket}/`)) {
      path = path.substring(`${bucket}/`.length);
    }

    if (!path) return 'Invalid document path.';

    const result = await protectedPost<{ url: string }>(
      '/api/accounts/kyc/document/sign/',
      { bucket, path }
    );

    if (!result?.url) {
      return 'Unable to open the document.';
    }

    const newWindow = window.open(
      result.url,
      '_blank',
      'noopener,noreferrer'
    );

    if (!newWindow) {
      return 'The document could not be opened. Please allow pop-ups for this site.';
    }

    return null;
  } catch (error) {
    console.error('Unexpected private document error:', error);
    return 'Unable to open the document.';
  }
}
