from unittest.mock import Mock, patch
from uuid import uuid4

from django.test import TestCase
from rest_framework.exceptions import ValidationError

from .services import create_listing


class PMSListingCapacityRegressionTests(TestCase):
    def make_profile(self):
        profile = Mock()
        profile.id = uuid4()
        profile.role = 'real_estate'
        return profile

    @patch('apps.listings.services._create_listing_from_data')
    @patch('apps.listings.services.get_listing_entitlement')
    @patch('apps.listings.services.Profile.objects')
    def test_pms_listing_uses_subscription_even_when_free_listing_exists(
        self, profile_manager, get_entitlement, create_listing_from_data
    ):
        profile = self.make_profile()
        profile_manager.select_for_update.return_value.get.return_value = profile
        subscription_id = uuid4()
        get_entitlement.return_value = {
            'can_start_listing': True,
            'can_create': True,
            'subscription_status': 'ACTIVE',
            'entitlement_source': 'FREE',
            'subscription_id': subscription_id,
            'subscription_listings_remaining': 9,
        }
        create_listing_from_data.return_value = {'listing_created': True}

        create_listing(profile, {'is_property_management': True})

        kwargs = create_listing_from_data.call_args.kwargs
        self.assertEqual(kwargs['entitlement']['entitlement_source'], 'SUBSCRIPTION')
        self.assertEqual(kwargs['entitlement']['subscription_id'], subscription_id)

    @patch('apps.listings.services._create_listing_from_data')
    @patch('apps.listings.services.get_listing_entitlement')
    @patch('apps.listings.services.Profile.objects')
    def test_pms_listing_is_rejected_when_subscription_capacity_is_exhausted(
        self, profile_manager, get_entitlement, create_listing_from_data
    ):
        profile = self.make_profile()
        profile_manager.select_for_update.return_value.get.return_value = profile
        get_entitlement.return_value = {
            'can_start_listing': True,
            'can_create': True,
            'subscription_status': 'ACTIVE',
            'subscription_id': uuid4(),
            'subscription_listings_remaining': 0,
        }

        with self.assertRaises(ValidationError):
            create_listing(profile, {'is_property_management': True})

        create_listing_from_data.assert_not_called()
