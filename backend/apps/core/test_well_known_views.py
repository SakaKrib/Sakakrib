import json

from django.test import SimpleTestCase, override_settings
from django.test.client import RequestFactory

from .well_known_views import android_assetlinks


class AndroidAssetLinksTests(SimpleTestCase):
    def setUp(self):
        self.request = RequestFactory().get('/.well-known/assetlinks.json')

    @override_settings(ANDROID_APP_SHA256_CERT_FINGERPRINTS=[
        'AA:BB:CC:DD',
        '11:22:33:44',
    ])
    def test_publishes_sakakrib_package_and_configured_signing_fingerprints(self):
        response = android_assetlinks(self.request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(json.loads(response.content), [{
            'relation': ['delegate_permission/common.handle_all_urls'],
            'target': {
                'namespace': 'android_app',
                'package_name': 'com.sakakrib.app',
                'sha256_cert_fingerprints': ['AA:BB:CC:DD', '11:22:33:44'],
            },
        }])

    @override_settings(ANDROID_APP_SHA256_CERT_FINGERPRINTS=[])
    def test_returns_no_associations_when_no_signing_fingerprint_is_configured(self):
        response = android_assetlinks(self.request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(json.loads(response.content), [])
