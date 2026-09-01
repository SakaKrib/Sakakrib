from unittest.mock import Mock
from uuid import uuid4

from django.test import SimpleTestCase

from .constants import FREE_LISTING_LIMIT, INDIVIDUAL_LISTING_PRICE_KES, LANDLORD_PLANS, REAL_ESTATE_PLANS
from .services import get_subscription_access


class SubscriptionConstantsTests(SimpleTestCase):
    def test_listing_defaults(self):
        self.assertEqual(FREE_LISTING_LIMIT, 3)
        self.assertEqual(INDIVIDUAL_LISTING_PRICE_KES, 1000)

    def test_landlord_plans_match_supabase(self):
        self.assertEqual(LANDLORD_PLANS['STARTER'], {'max_listings': 5, 'max_units_per_listing': 5, 'monthly_price_kes': 500, 'annual_price_kes': 5000})
        self.assertEqual(LANDLORD_PLANS['GROWTH'], {'max_listings': 20, 'max_units_per_listing': 20, 'monthly_price_kes': 1500, 'annual_price_kes': 15000})
        self.assertEqual(LANDLORD_PLANS['PRO']['max_listings'], None)

    def test_real_estate_plans_match_supabase(self):
        self.assertEqual(REAL_ESTATE_PLANS['STARTER']['max_listings'], 10)
        self.assertEqual(REAL_ESTATE_PLANS['GROWTH']['max_listings'], 30)
        self.assertEqual(REAL_ESTATE_PLANS['PRO']['max_listings'], 50)
        self.assertEqual(REAL_ESTATE_PLANS['ENTERPRISE']['max_listings'], None)


class SubscriptionAccessLogicTests(SimpleTestCase):
    def make_profile(self, **values):
        profile = Mock()
        profile.id = values.get('id', uuid4())
        profile.role = values.get('role', 'landlord')
        profile.verification_status = values.get('verification_status', 'verified')
        profile.landlord_application_status = values.get('landlord_application_status', 'approved')
        profile.real_estate_application_status = values.get('real_estate_application_status', 'approved')
        profile.free_listings_used = values.get('free_listings_used', 0)
        return profile

    def test_free_entitlement_allows_creation(self):
        result = get_subscription_access(self.make_profile())
        self.assertTrue(result['authorized'])
        self.assertTrue(result['can_start_listing'])
        self.assertTrue(result['can_create'])
        self.assertEqual(result['free_listings_remaining'], 3)
        self.assertEqual(result['individual_listing_price_kes'], 1000)

    def test_landlord_pending_application_cannot_create(self):
        result = get_subscription_access(self.make_profile(landlord_application_status='pending'))
        self.assertFalse(result['can_start_listing'])
        self.assertFalse(result['can_create'])

    def test_real_estate_pending_application_cannot_create(self):
        result = get_subscription_access(self.make_profile(role='real_estate', real_estate_application_status='pending'))
        self.assertFalse(result['can_start_listing'])
        self.assertFalse(result['can_create'])

    def test_unverified_real_estate_cannot_create(self):
        result = get_subscription_access(self.make_profile(role='real_estate', verification_status='pending'))
        self.assertFalse(result['can_start_listing'])
        self.assertFalse(result['can_create'])
