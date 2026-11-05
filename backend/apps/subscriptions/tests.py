from unittest.mock import Mock, patch
from uuid import uuid4

from django.test import SimpleTestCase, override_settings

from .payment_services import _paypal_frontend_urls

from .constants import FREE_LISTING_LIMIT, INDIVIDUAL_LISTING_PRICE_KES, LANDLORD_PLANS, REAL_ESTATE_PLANS
from .services import get_pms_access, get_subscription_access


class SubscriptionConstantsTests(SimpleTestCase):
    def test_listing_defaults(self):
        self.assertEqual(FREE_LISTING_LIMIT, 3)
        self.assertEqual(INDIVIDUAL_LISTING_PRICE_KES, 1000)

    def test_landlord_plans(self):
        self.assertEqual(LANDLORD_PLANS['STARTER']['max_listings'], 5)
        self.assertEqual(LANDLORD_PLANS['GROWTH']['max_listings'], 20)
        self.assertIsNone(LANDLORD_PLANS['PRO']['max_listings'])

    def test_real_estate_plans(self):
        self.assertEqual(REAL_ESTATE_PLANS['STARTER']['max_listings'], 5)
        self.assertEqual(REAL_ESTATE_PLANS['GROWTH']['max_listings'], 20)
        self.assertIsNone(REAL_ESTATE_PLANS['PRO']['max_listings'])
        self.assertIsNone(REAL_ESTATE_PLANS['ENTERPRISE']['max_listings'])


class SubscriptionAccessLogicTests(SimpleTestCase):
    def make_profile(self, **values):
        profile = Mock()
        profile.id = values.get('id', uuid4())
        profile.role = values.get('role', 'landlord')
        profile.verification_status = values.get('verification_status', 'verified')
        profile.kyc_completed = values.get('kyc_completed', True)
        profile.email_verified = values.get('email_verified', True)
        profile.landlord_application_status = values.get('landlord_application_status', 'approved')
        profile.real_estate_application_status = values.get('real_estate_application_status', 'approved')
        profile.free_listings_used = values.get('free_listings_used', 0)
        profile.is_authenticated = True
        return profile

    @patch('apps.listings.services._current_subscription', return_value=None)
    def test_free_entitlement_allows_creation(self, _subscription):
        result = get_subscription_access(self.make_profile())
        self.assertTrue(result['authorized'])
        self.assertTrue(result['can_start_listing'])

class PayPalFrontendUrlTests(SimpleTestCase):
    @override_settings(
        SAKAKRIB_PUBLIC_FRONTEND_URL='https://nonvalued-alberta-overexpectantly.ngrok-free.dev',
        CORS_ALLOWED_ORIGINS=['https://localhost'],
    )
    def test_public_frontend_overrides_capacitor_request_origin(self):
        return_url, cancel_url = _paypal_frontend_urls(
            'https://localhost', 'invoice-123'
        )

        expected_origin = 'https://nonvalued-alberta-overexpectantly.ngrok-free.dev'
        self.assertEqual(
            return_url,
            f'{expected_origin}/paypal/subscription/return?invoice_id=invoice-123',
        )
        self.assertEqual(
            cancel_url,
            f'{expected_origin}/paypal/subscription/cancel?invoice_id=invoice-123',
        )

    @override_settings(SAKAKRIB_PUBLIC_FRONTEND_URL='http://example.test')
    def test_public_frontend_rejects_non_https_url(self):
        with self.assertRaisesMessage(ValueError, 'must be an HTTPS origin'):
            _paypal_frontend_urls('https://localhost', 'invoice-123')

    @override_settings(
        SAKAKRIB_PUBLIC_FRONTEND_URL='',
        CORS_ALLOWED_ORIGINS=['https://localhost'],
    )
    def test_allowed_request_origin_remains_fallback_without_public_url(self):
        return_url, cancel_url = _paypal_frontend_urls(
            'https://localhost', 'invoice-123'
        )

        self.assertTrue(return_url.startswith('https://localhost/'))
        self.assertTrue(cancel_url.startswith('https://localhost/'))
