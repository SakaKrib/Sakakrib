from pathlib import Path

p = Path('src/components/DocumentCapture.tsx')
text = p.read_text()
old = """      if (!response.ok) {
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
      }"""
new = """      const storagePath = result?.path;

      if (!storagePath) {
        throw new Error(
          'The document was uploaded but its storage path could not be confirmed.'
        );
      }

      const publicUrl = await resolveSignedUrl(storagePath);

      if (!publicUrl) {
        throw new Error(
          'The document was uploaded but could not be opened securely.'
        );
      }"""
if old not in text:
    raise SystemExit('DocumentCapture response handling block not found')
p.write_text(text.replace(old, new, 1))
