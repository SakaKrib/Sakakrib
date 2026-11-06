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


def apple_app_site_association(_request):
    """Publish iOS Universal Links only when the Apple developer Team ID is configured."""
    team_id = str(getattr(settings, 'IOS_APP_TEAM_ID', '') or '').strip()
    if not team_id:
        return JsonResponse(
            {'applinks': {'apps': [], 'details': []}},
            status=503,
        )

    bundle_id = str(
        getattr(settings, 'IOS_APP_BUNDLE_ID', 'com.sakakrib.app') or 'com.sakakrib.app'
    ).strip()
    return JsonResponse({
        'applinks': {
            'apps': [],
            'details': [{
                'appIDs': [f'{team_id}.{bundle_id}'],
                'components': [{'/': '/app/*'}],
            }],
        },
    })
