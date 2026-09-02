from unittest.mock import Mock, patch
from uuid import uuid4

from django.test import SimpleTestCase

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
        self.assertEqual(REAL_ESTATE_PLANS['STARTER']['max_listings'], 10)
        self.assertEqual(REAL_ESTATE_PLANS['GROWTH']['max_listings'], 30)
        self.assertEqual(REAL_ESTATE_PLANS['PRO']['max_listings'], 50)
        self.assertIsNone(REAL_ESTATE_PLANS['ENTERPRISE']['max_listings'])


class SubscriptionAccessLogicTests(SimpleTestCase):
    def make_profile(self, **values):
        profile = Mock()
        profile.id = values.get('id', uuid4())
        profile.role = values.get('role', 'landlord')
        profile.verification_status = values.get('verification_status', 'verified')
        profile.kyc_completed = values.get('kyc_completed', True)
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
        self.assertTrue(result['can_create'])
        self.assertEqual(result['entitlement_source'], 'FREE')
        self.assertEqual(result['free_listings_remaining'], 3)
        self.assertEqual(result['individual_listing_price_kes'], 1000)

    @patch('apps.listings.services._current_subscription', return_value=None)
    def test_landlord_pending_application_cannot_create(self, _subscription):
        result = get_subscription_access(self.make_profile(landlord_application_status='pending'))
        self.assertFalse(result['can_start_listing'])
        self.assertFalse(result['can_create'])

    @patch('apps.listings.services._current_subscription', return_value=None)
    def test_real_estate_pending_application_cannot_create(self, _subscription):
        result = get_subscription_access(self.make_profile(role='real_estate', real_estate_application_status='pending'))
        self.assertFalse(result['can_start_listing'])
        self.assertFalse(result['can_create'])

    @patch('apps.listings.services._current_subscription', return_value=None)
    def test_unverified_real_estate_cannot_create(self, _subscription):
        result = get_subscription_access(self.make_profile(role='real_estate', verification_status='pending'))
        self.assertFalse(result['can_start_listing'])
        self.assertFalse(result['can_create'])


class PMSAccessLogicTests(SimpleTestCase):
    def make_profile(self, **values):
        profile = Mock()
        profile.id = values.get('id', uuid4())
        profile.role = values.get('role', 'real_estate')
        profile.verification_status = values.get('verification_status', 'verified')
        profile.kyc_completed = values.get('kyc_completed', True)
        profile.landlord_application_status = values.get('landlord_application_status', 'approved')
        profile.real_estate_application_status = values.get('real_estate_application_status', 'approved')
        profile.is_authenticated = True
        return profile

    @patch('apps.subscriptions.services.get_current_subscription', return_value=None)
    def test_real_estate_without_subscription_is_denied(self, _subscription):
        result = get_pms_access(self.make_profile())
        self.assertFalse(result['allowed'])
        self.assertEqual(result['reason'], 'ACTIVE_SUBSCRIPTION_REQUIRED')
        self.assertEqual(result['role'], 'real_estate')

    @patch('apps.subscriptions.services.get_current_subscription')
    def test_real_estate_active_subscription_gets_full_access(self, get_subscription):
        subscription = Mock(id=uuid4(), status='ACTIVE')
        get_subscription.return_value = subscription
        result = get_pms_access(self.make_profile())
        self.assertTrue(result['allowed'])
        self.assertFalse(result['read_only'])
        self.assertEqual(result['reason'], 'SUBSCRIPTION_ACTIVE')
        self.assertEqual(result['role'], 'real_estate')

    @patch('apps.subscriptions.services.get_current_subscription')
    def test_real_estate_grace_subscription_is_read_only(self, get_subscription):
        subscription = Mock(id=uuid4(), status='GRACE_PERIOD')
        get_subscription.return_value = subscription
        result = get_pms_access(self.make_profile())
        self.assertTrue(result['allowed'])
        self.assertTrue(result['read_only'])
        self.assertEqual(result['reason'], 'SUBSCRIPTION_GRACE_PERIOD')

    @patch('apps.subscriptions.services.get_current_subscription', return_value=None)
    def test_real_estate_pending_application_is_denied(self, _subscription):
        result = get_pms_access(self.make_profile(real_estate_application_status='pending'))
        self.assertFalse(result['allowed'])
        self.assertEqual(result['reason'], 'REAL_ESTATE_APPLICATION_NOT_APPROVED')

    @patch('apps.subscriptions.services.get_current_subscription', return_value=None)
    def test_landlord_pending_application_is_denied(self, _subscription):
        result = get_pms_access(self.make_profile(role='landlord', landlord_application_status='pending'))
        self.assertFalse(result['allowed'])
        self.assertEqual(result['reason'], 'LANDLORD_APPLICATION_NOT_APPROVED')
