from django.test import SimpleTestCase, override_settings

from .payment_services import _paypal_frontend_urls


class PayPalNativeReturnUrlTests(SimpleTestCase):
    @override_settings(
        SAKAKRIB_PUBLIC_BASE_URL='https://app.example.test',
        SAKAKRIB_PUBLIC_FRONTEND_URL='https://website.example.test',
        SAKAKRIB_ANDROID_PAYPAL_RETURN_URL='',
        SAKAKRIB_ANDROID_PAYPAL_CANCEL_URL='',
    )
    def test_android_uses_app_links_when_platform_urls_are_not_explicitly_set(self):
        return_url, cancel_url = _paypal_frontend_urls(
            'https://website.example.test', 'invoice-123', 'android'
        )

        self.assertEqual(
            return_url,
            'https://app.example.test/paypal/subscription/return?invoice_id=invoice-123',
        )
        self.assertEqual(
            cancel_url,
            'https://app.example.test/paypal/subscription/cancel?invoice_id=invoice-123',
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
    def test_web_checkout_keeps_existing_website_return_urls(self):
        return_url, cancel_url = _paypal_frontend_urls(
            'https://website.example.test', 'invoice-123', 'web'
        )

        self.assertEqual(
            return_url,
            'https://website.example.test/paypal/subscription/return?invoice_id=invoice-123',
        )
        self.assertEqual(
            cancel_url,
            'https://website.example.test/paypal/subscription/cancel?invoice_id=invoice-123',
        )
