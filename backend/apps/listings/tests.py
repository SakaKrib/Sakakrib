from unittest.mock import Mock, patch
from uuid import uuid4

from django.test import SimpleTestCase
from rest_framework.exceptions import ValidationError

from .services import create_listing


class RealEstatePMSListingCreationTests(SimpleTestCase):
    def make_profile(self):
        profile = Mock()
        profile.id = uuid4()
        profile.role = 'real_estate'
        return profile

    @patch('apps.listings.services._create_listing_from_data')
    @patch('apps.listings.services.get_listing_entitlement')
    @patch('apps.listings.services.Profile.objects')
    def test_real_estate_can_create_property_management_listing_with_active_subscription(
        self, profile_manager, get_entitlement, create_listing_from_data
    ):
        profile = self.make_profile()
        profile_manager.select_for_update.return_value.get.return_value = profile
        get_entitlement.return_value = {
            'can_start_listing': True,
            'can_create': True,
            'subscription_status': 'ACTIVE',
            'entitlement_source': 'SUBSCRIPTION',
            'subscription_id': uuid4(),
        }
        create_listing_from_data.return_value = {'listing_created': True}

        result = create_listing(profile, {'is_property_management': True})

        self.assertTrue(result['listing_created'])
        create_listing_from_data.assert_called_once()

    @patch('apps.listings.services.get_listing_entitlement')
    @patch('apps.listings.services.Profile.objects')
    def test_real_estate_property_management_listing_requires_active_subscription(
        self, profile_manager, get_entitlement
    ):
        profile = self.make_profile()
        profile_manager.select_for_update.return_value.get.return_value = profile
        get_entitlement.return_value = {
            'can_start_listing': True,
            'can_create': True,
            'subscription_status': 'GRACE_PERIOD',
            'entitlement_source': 'SUBSCRIPTION',
        }

        with self.assertRaises(ValidationError):
            create_listing(profile, {'is_property_management': True})
