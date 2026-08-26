import { supabase } from '@/lib/supabase';

export const openStorageDocument = async (
  documentPath: string | null | undefined,
  bucketName = 'id-documents'
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

    // ============================================================
    // NORMALIZE SUPABASE STORAGE PATH
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
    // CREATE TEMPORARY SIGNED URL
    // ============================================================

    const { data, error } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(path, 300);

    if (error) {
      console.error(
        'Failed to create signed storage URL:',
        {
          error,
          bucket: bucketName,
          path,
        }
      );

      return false;
    }

    if (!data?.signedUrl) {
      console.error(
        'Supabase returned no signed URL.'
      );

      return false;
    }

    // ============================================================
    // OPEN DOCUMENT
    // ============================================================

    const newWindow = window.open(
      data.signedUrl,
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