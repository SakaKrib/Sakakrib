from django.conf import settings
from django.http import JsonResponse


def android_assetlinks(_request):
    """Publish Android App Links verification for the configured signing certificate(s)."""
    fingerprints = list(
        getattr(settings, 'ANDROID_APP_SHA256_CERT_FINGERPRINTS', [])
    )
    if not fingerprints:
        return JsonResponse([], safe=False)

    return JsonResponse(
        [
            {
                'relation': ['delegate_permission/common.handle_all_urls'],
                'target': {
                    'namespace': 'android_app',
                    'package_name': 'com.sakakrib.app',
                    'sha256_cert_fingerprints': fingerprints,
                },
            }
        ],
        safe=False,
    )
