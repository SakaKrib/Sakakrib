// ============================================================
// OPEN PRIVATE STORAGE DOCUMENT
//
// Django replacement for the previous Supabase protected-api
// storage transport. The document remains private; Django checks
// ownership/admin access and returns a short-lived signed URL.
// ============================================================

const ALLOWED_BUCKETS = [
  'id-documents',
  'licenses',
  'kyc-documents',
] as const;

type AllowedBucket = (typeof ALLOWED_BUCKETS)[number];

export const openStorageDocument = async (
  documentPath: string | null | undefined,
  bucketName: string = 'id-documents'
): Promise<boolean> => {
  if (!documentPath) {
    console.error('Storage document path is missing.');
    return false;
  }

  try {
    let path = documentPath.trim();
    if (!path) return false;

    if (!ALLOWED_BUCKETS.includes(bucketName as AllowedBucket)) {
      console.error('Unsupported storage bucket for document viewing:', bucketName);
      return false;
    }

    // Accept legacy Supabase storage URLs while the data migration is in progress.
    const publicMarker = `/storage/v1/object/public/${bucketName}/`;
    const signedMarker = `/storage/v1/object/sign/${bucketName}/`;
    if (path.includes(publicMarker)) path = path.split(publicMarker)[1];
    else if (path.includes(signedMarker)) path = path.split(signedMarker)[1];
    if (path.startsWith(`${bucketName}/`)) path = path.substring(`${bucketName}/`.length);
    path = path.replace(/^\/+/, '').split('?')[0];

    if (!path) {
      console.error('Invalid storage document path.');
      return false;
    }

    const { protectedPost } = await import('@/lib/djangoApi');
    const result = await protectedPost<{ url: string }>('/api/accounts/kyc/document/sign/', {
      path,
      bucket: bucketName,
    });

    if (!result?.url) {
      console.error('Failed to create signed storage URL.');
      return false;
    }

    const newWindow = window.open(result.url, '_blank', 'noopener,noreferrer');
    if (!newWindow) {
      console.error('Browser blocked the document window.');
      return false;
    }
    return true;
  } catch (error) {
    console.error('Unexpected storage document error:', error);
    return false;
  }
};

export default openStorageDocument;