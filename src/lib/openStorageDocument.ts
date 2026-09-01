// ============================================================
// OPEN STORAGE DOCUMENT (ADMIN + OWNER)
//
// FIX: previously called supabase.storage.from(bucket)
// .createSignedUrl() directly. Under HttpOnly-cookie auth the raw
// Supabase JS client has no client-readable session, so that call
// failed for every caller - not an RLS problem (RLS already has a
// dedicated "Admins can view private KYC documents" SELECT policy
// on id-documents/licenses/kyc-documents, verified live), just a
// transport problem. Rewired to call protected-api's /storage/sign
// route instead, same credentials:'include' pattern used everywhere
// else in the app now. That route checks owner-or-admin at the
// application level and then generates the signed URL using the
// caller's own authenticated identity, so storage RLS's admin
// policy applies exactly as it already does for direct table access.
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

    if (!path) {
      console.error('Storage document path is empty.');
      return false;
    }

    if (
      !ALLOWED_BUCKETS.includes(
        bucketName as AllowedBucket
      )
    ) {
      console.error(
        'Unsupported storage bucket for document viewing:',
        bucketName
      );
      return false;
    }

    // ============================================================
    // NORMALIZE SUPABASE STORAGE PATH
    //
    // Unchanged from before - this is pure string parsing, nothing
    // here depended on the Supabase client.
    // ============================================================

    const publicMarker =
      `/storage/v1/object/public/${bucketName}/`;

    const signedMarker =
      `/storage/v1/object/sign/${bucketName}/`;

    // Existing public URL
    if (path.includes(publicMarker)) {
      path = path.split(publicMarker)[1];
    }

    // Existing signed URL
    else if (path.includes(signedMarker)) {
      path = path.split(signedMarker)[1];
    }

    // Remove bucket prefix if present
    if (path.startsWith(`${bucketName}/`)) {
      path = path.substring(
        `${bucketName}/`.length
      );
    }

    // Remove leading slash
    path = path.replace(/^\/+/, '');

    // Remove query parameters
    path = path.split('?')[0];

    if (!path) {
      console.error(
        'Invalid storage document path.'
      );
      return false;
    }

    console.log(
      'Opening Supabase storage document:',
      {
        bucket: bucketName,
        path,
      }
    );

    // ============================================================
    // CREATE TEMPORARY SIGNED URL VIA protected-api
    //
    // Deliberately a raw fetch, not protectedGet/protectedPost from
    // protectedApi.ts - that helper only allows /rest/v1/ paths by
    // design. /storage/sign is a sibling route on the same Edge
    // Function, same credentials:'include' HttpOnly-cookie
    // transport, matching DocumentCapture.tsx's established pattern.
    // ============================================================

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !anonKey) {
      console.error(
        'Supabase configuration is missing.'
      );
      return false;
    }

    const response = await fetch(
      `${supabaseUrl}/functions/v1/protected-api/storage/sign`,
      {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          apikey: anonKey,
        },
        body: JSON.stringify({
          bucket: bucketName,
          path,
        }),
      }
    );

    const result = await response
      .json()
      .catch(() => null);

    if (!response.ok || !result?.url) {
      console.error(
        'Failed to create signed storage URL:',
        {
          error: result?.error ?? `HTTP ${response.status}`,
          bucket: bucketName,
          path,
        }
      );

      return false;
    }

    // ============================================================
    // OPEN DOCUMENT
    // ============================================================

    const newWindow = window.open(
      result.url as string,
      '_blank',
      'noopener,noreferrer'
    );

    if (!newWindow) {
      console.error(
        'Browser blocked the document window.'
      );

      return false;
    }

    return true;
  } catch (error) {
    console.error(
      'Unexpected storage document error:',
      error
    );

    return false;
  }
};

export default openStorageDocument;