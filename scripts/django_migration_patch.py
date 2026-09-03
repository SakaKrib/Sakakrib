from pathlib import Path
import re


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"Expected text not found in {path}: {old[:120]}")
    p.write_text(text.replace(old, new, 1))


# Keep the Django compatibility boundary while consumers are migrated.
for p in Path("src").rglob("*"):
    if p.suffix not in {".ts", ".tsx"}:
        continue
    text = p.read_text()
    text = text.replace("@/lib/protectedApi", "@/lib/djangoLegacyApi")
    p.write_text(text)

# Move only type-only Supabase imports to transport-neutral domain contracts.
type_import = re.compile(
    r"import\s+type\s+(\{.*?\})\s+from\s+(['\"])(?:@/lib/supabase|\.\.?/.*?/lib/supabase)\2;?",
    re.S,
)
for p in Path("src").rglob("*"):
    if p.suffix not in {".ts", ".tsx"}:
        continue
    text = p.read_text()
    text = type_import.sub(r"import type \1 from '@/types/domain';", text)
    p.write_text(text)

# AuthModal password reset -> Django.
replace_once(
    "src/components/AuthModal.tsx",
    "import { supabase } from '@/lib/supabase';",
    "import { protectedPost } from '@/lib/djangoApi';",
)
replace_once(
    "src/components/AuthModal.tsx",
    """        const { error: resetError } =
          await supabase.auth.resetPasswordForEmail(
            normalizedEmail,
            {
              redirectTo:
                window.location.origin,
            },
          );""",
    """        await protectedPost('/api/accounts/password-reset/', {
          email: normalizedEmail,
          redirect_to: window.location.origin,
        });

        const resetError = null;""",
)

# PMS subscription page -> Django gateway without changing the UI/workflow.
replace_once(
    "src/components/PMS/PMSSubscriptionPage.tsx",
    'import { supabase } from "../../lib/supabase";',
    'import { djangoPmsGateway } from "@/lib/djangoPmsGateway";',
)
p = Path("src/components/PMS/PMSSubscriptionPage.tsx")
p.write_text(p.read_text().replace("supabase.", "djangoPmsGateway."))

# Remove confirmed-unused runtime import.
p = Path("src/pages/ListingManagePage.tsx")
p.write_text(p.read_text().replace("import { supabase } from '@/lib/supabase';\n", "", 1))

# ChatPage already uses Django endpoints; repair its pre-existing JSX conditional.
p = Path("src/pages/ChatPage.tsx")
text = p.read_text()
bad = '{scheduleError && <p className="mt-2 text-sm text-destructive">{scheduleError}</p></div>}'
good = '{scheduleError && <p className="mt-2 text-sm text-destructive">{scheduleError}</p>}</div>}'
if bad not in text:
    raise SystemExit("ChatPage scheduler JSX block not found")
p.write_text(text.replace(bad, good, 1))

# DocumentCapture -> Django private document upload/sign endpoints.
p = Path("src/components/DocumentCapture.tsx")
text = p.read_text()
text = text.replace(
    "import { cn } from '@/lib/utils';",
    "import { cn } from '@/lib/utils';\nimport { protectedPost, protectedUpload } from '@/lib/djangoApi';",
    1,
)
resolve = re.compile(
    r"  const resolveSignedUrl = useCallback\(.*?\n  \);\n\n  /\*\n  \|--------------------------------------------------------------------------\n  \| STOP CAMERA",
    re.S,
)
replacement = """  const resolveSignedUrl = useCallback(
    async (path: string): Promise<string | null> => {
      try {
        const result = await protectedPost<{ url?: string }>(
          '/api/accounts/kyc/document/sign/',
          { bucket, path },
        );
        return result?.url || null;
      } catch {
        return null;
      }
    },
    [bucket]
  );

  /*
  |--------------------------------------------------------------------------
  | STOP CAMERA"""
text, count = resolve.subn(replacement, text, count=1)
if count != 1:
    raise SystemExit("DocumentCapture signing block not found")

upload = re.compile(
    r"      const response =\n        await fetch\(\n          `\$\{import\.meta\.env\.VITE_SUPABASE_URL\}/functions/v1/protected-api/storage/upload`,.*?\n      const result =\n        await response\.json\(\);",
    re.S,
)
upload_replacement = """      const result = await protectedUpload<{
        path?: string;
        bucket?: string;
        size?: number;
        mime_type?: string;
      }>('/api/accounts/documents/upload/', formData);"""
text, count = upload.subn(upload_replacement, text, count=1)
if count != 1:
    raise SystemExit("DocumentCapture upload block not found")
p.write_text(text)
