from urllib.parse import parse_qs, urlsplit

from django.core import signing
from django.test import SimpleTestCase, override_settings

from .payment_services import _paypal_frontend_urls


class PayPalNativeReturnUrlTests(SimpleTestCase):
    def assert_signed_return_url(self, url, expected_path, expected_platform='android', expected_plan=None, expected_cycle=None):
        parts = urlsplit(url)
        query = parse_qs(parts.query)
        self.assertEqual(parts.path, expected_path)
        self.assertEqual(query.get('invoice_id'), ['invoice-123'])
        self.assertIn('state', query)
        expected_state = {'invoice_id': 'invoice-123', 'client_platform': expected_platform}
        if expected_plan:
            expected_state['plan_name'] = expected_plan
        if expected_cycle:
            expected_state['billing_cycle'] = expected_cycle
        self.assertEqual(
            signing.loads(
                query['state'][0],
                salt='sakakrib.paypal-subscription-return',
            ),
            expected_state,
        )

    @override_settings(
        SAKAKRIB_PUBLIC_BASE_URL='https://app.example.test',
        SAKAKRIB_PUBLIC_FRONTEND_URL='https://app.example.test',
        SAKAKRIB_ANDROID_PAYPAL_RETURN_URL='',
        SAKAKRIB_ANDROID_PAYPAL_CANCEL_URL='',
    )
    def test_android_uses_signed_app_links_when_platform_urls_are_not_explicitly_set(self):
        return_url, cancel_url = _paypal_frontend_urls(
            'https://website.example.test', 'invoice-123', 'android'
        )

        self.assertEqual(urlsplit(return_url).netloc, 'app.example.test')
        self.assert_signed_return_url(return_url, '/paypal/subscription/return', 'android')
        self.assertEqual(urlsplit(cancel_url).netloc, 'app.example.test')
        self.assert_signed_return_url(cancel_url, '/paypal/subscription/cancel', 'android')

    @override_settings(
        SAKAKRIB_PUBLIC_BASE_URL='https://app.example.test',
        SAKAKRIB_ANDROID_PAYPAL_RETURN_URL='',
        SAKAKRIB_ANDROID_PAYPAL_CANCEL_URL='',
    )
    def test_native_return_state_preserves_plan_and_billing_cycle(self):
        return_url, cancel_url = _paypal_frontend_urls(
            'https://website.example.test', 'invoice-123', 'android', 'GROWTH', 'ANNUAL'
        )

        self.assert_signed_return_url(
            return_url, '/paypal/subscription/return', 'android', 'GROWTH', 'ANNUAL'
        )
        self.assert_signed_return_url(
            cancel_url, '/paypal/subscription/cancel', 'android', 'GROWTH', 'ANNUAL'
        )

    @override_settings(
        SAKAKRIB_PUBLIC_BASE_URL='',
        SAKAKRIB_PUBLIC_FRONTEND_URL='https://website.example.test',
        SAKAKRIB_ANDROID_PAYPAL_RETURN_URL='',
        SAKAKRIB_ANDROID_PAYPAL_CANCEL_URL='',
    )
    def test_android_does_not_fall_back_to_website_redirects(self):
        with self.assertRaisesRegex(ValueError, 'SAKAKRIB_PUBLIC_BASE_URL is missing'):
            _paypal_frontend_urls('https://website.example.test', 'invoice-123', 'android')

    @override_settings(
        SAKAKRIB_PUBLIC_BASE_URL='https://app.example.test',
        SAKAKRIB_PUBLIC_FRONTEND_URL='https://website.example.test',
        SAKAKRIB_ANDROID_PAYPAL_RETURN_URL='',
        SAKAKRIB_ANDROID_PAYPAL_CANCEL_URL='',
    )
    def test_web_checkout_uses_canonical_origin_and_signed_status(self):
        return_url, cancel_url = _paypal_frontend_urls(
            'https://website.example.test', 'invoice-123', 'web'
        )

        self.assertEqual(urlsplit(return_url).netloc, 'app.example.test')
        self.assert_signed_return_url(return_url, '/paypal/subscription/return', 'web')
        self.assertEqual(urlsplit(cancel_url).netloc, 'app.example.test')
        self.assert_signed_return_url(cancel_url, '/paypal/subscription/cancel', 'web')
