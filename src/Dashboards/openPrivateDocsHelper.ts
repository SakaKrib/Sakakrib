// src/lib/openPrivateDocsHelper.ts

import { supabase } from '@/lib/supabase';

type DocumentType = 'id' | 'selfie';

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
     * CREATE SIGNED URL
     * --------------------------------------------------------
     */

    const {
      data,
      error,
    } = await supabase.storage
      .from(bucket)
      .createSignedUrl(
        path,
        300
      );

    if (error) {
      console.error(
        'KYC createSignedUrl failed:',
        {
          message: error.message,
          bucket,
          path,
          documentType,
          error,
        }
      );

      if (
        error.message
          ?.toLowerCase()
          .includes('bucket not found')
      ) {
        return `Storage bucket "${bucket}" was not found.`;
      }

      if (
        error.message
          ?.toLowerCase()
          .includes('object not found')
      ) {
        return (
          'The document file could not be found in storage.'
        );
      }

      return (
        error.message ||
        'Unable to open the document.'
      );
    }

    if (!data?.signedUrl) {
      return 'Unable to generate a secure document URL.';
    }

    /*
     * --------------------------------------------------------
     * OPEN DOCUMENT
     * --------------------------------------------------------
     */

    const newWindow = window.open(
      data.signedUrl,
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