// src/lib/openPrivateDocsHelper.ts
//
// FIX: previously called supabase.storage.from(bucket)
// .createSignedUrl() directly. Under HttpOnly-cookie auth the raw
// Supabase JS client has no client-readable session, so this failed
// for every caller regardless of RLS. Rewired to call protected-api's
// /storage/sign route (same credentials:'include' HttpOnly-cookie
// transport as everywhere else in the app now, same route
// openStorageDocument.ts already uses). That route is authorized for
// the document's owner OR an admin, backed by storage.objects' own
// "Admins can view private KYC documents" RLS policy - verified live.

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

    if (!value) {
      return 'Invalid document path.';
    }

    /*
     * --------------------------------------------------------
     * DETERMINE BUCKET + PATH
     * --------------------------------------------------------
     *
     * Unchanged from before - this is pure string parsing,
     * nothing here depended on the Supabase client.
     *
     * New KYC files:
     *
     * kyc-documents/user-id/id-123.jpg
     * kyc-documents/user-id/selfie-123.jpg
     *
     * Old ID files may still contain:
     *
     * https://.../storage/v1/object/public/id-documents/user-id/file.jpg
     *
     * Therefore we MUST detect the bucket from the URL
     * instead of blindly assuming the bucket from documentType.
     */

    let bucket =
      documentType === 'selfie'
        ? 'kyc-documents'
        : 'kyc-documents';

    let path = value;

    /*
     * --------------------------------------------------------
     * FULL SUPABASE STORAGE URL
     * --------------------------------------------------------
     */

    const storageMatch = value.match(
      /\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/
    );

    if (storageMatch) {
      bucket = storageMatch[1];
      path = storageMatch[2];

      /*
       * Remove signed URL query parameters.
       */
      path = path.split('?')[0];
      path = path.split('#')[0];
    } else {
      /*
       * ------------------------------------------------------
       * RAW STORAGE PATH
       * ------------------------------------------------------
       *
       * Example:
       *
       * f686516d.../selfie-123.jpg
       */

      path = value
        .split('?')[0]
        .split('#')[0];

      /*
       * If database contains:
       *
       * kyc-documents/user-id/file.jpg
       *
       * detect and remove bucket prefix.
       */

      const knownBuckets = [
        'kyc-documents',
        'id-documents',
      ];

      for (const knownBucket of knownBuckets) {
        const prefix = `${knownBucket}/`;

        if (path.startsWith(prefix)) {
          bucket = knownBucket;
          path = path.substring(prefix.length);
          break;
        }
      }
    }

    /*
     * Remove leading slash.
     */
    path = path.replace(/^\/+/, '');

    /*
     * Remove accidental bucket prefix one more time.
     */
    if (path.startsWith(`${bucket}/`)) {
      path = path.substring(
        `${bucket}/`.length
      );
    }

    if (!path) {
      return 'Invalid document path.';
    }

    if (
      !ALLOWED_BUCKETS.includes(
        bucket as AllowedBucket
      )
    ) {
      console.error(
        'Unsupported storage bucket for KYC document viewing:',
        bucket
      );

      return `Storage bucket "${bucket}" is not supported.`;
    }

    console.log(
      'Opening KYC document:',
      {
        documentType,
        bucket,
        path,
      }
    );

    /*
     * --------------------------------------------------------
     * CREATE SIGNED URL VIA protected-api
     *
     * Deliberately a raw fetch, not protectedGet/protectedPost
     * from protectedApi.ts - that helper only allows /rest/v1/
     * paths by design. /storage/sign is a sibling route on the
     * same Edge Function, same credentials:'include' transport.
     * --------------------------------------------------------
     */

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !anonKey) {
      return 'Supabase configuration is missing.';
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
          bucket,
          path,
        }),
      }
    );

    const result = await response
      .json()
      .catch(() => null);

    if (!response.ok || !result?.url) {
      const message: string | undefined = result?.error;

      console.error(
        'KYC signed URL request failed:',
        {
          message,
          status: response.status,
          bucket,
          path,
          documentType,
        }
      );

      const lower = (message ?? '').toLowerCase();

      if (lower.includes('bucket not found')) {
        return `Storage bucket "${bucket}" was not found.`;
      }

      if (
        lower.includes('object not found') ||
        lower.includes('not found')
      ) {
        return (
          'The document file could not be found in storage.'
        );
      }

      return (
        message ||
        'Unable to open the document.'
      );
    }

    /*
     * --------------------------------------------------------
     * OPEN DOCUMENT
     * --------------------------------------------------------
     */

    const newWindow = window.open(
      result.url as string,
      '_blank',
      'noopener,noreferrer'
    );

    if (!newWindow) {
      return (
        'The document could not be opened. Please allow pop-ups for this site.'
      );
    }

    return null;

  } catch (error) {
    console.error(
      'Unexpected KYC document error:',
      error
    );

    return 'Unable to open the document.';
  }
}