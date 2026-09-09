from datetime import timedelta
from unittest.mock import Mock, patch

from django.test import SimpleTestCase
from django.utils import timezone

from .services import get_pms_access


class PMSAccessRegressionTests(SimpleTestCase):
    def make_profile(self, role):
        profile = Mock()
        profile.is_authenticated = True
        profile.role = role
        profile.verification_status = 'verified'
        profile.kyc_completed = True
        profile.email_verified = True
        profile.landlord_application_status = 'approved'
        profile.real_estate_application_status = 'approved'
        return profile

    @patch('apps.subscriptions.services.get_current_subscription')
    def test_real_estate_active_subscription_grants_pms_access(self, get_subscription):
        profile = self.make_profile('real_estate')
        subscription = Mock()
        subscription.status = 'ACTIVE'
        subscription.id = 'subscription-id'
        subscription.current_period_end = timezone.now() + timedelta(days=10)
        get_subscription.return_value = subscription

        result = get_pms_access(profile)

        self.assertTrue(result['allowed'])
        self.assertFalse(result['read_only'])
        self.assertEqual(result['role'], 'real_estate')
        self.assertEqual(result['subscription_id'], 'subscription-id')

    @patch('apps.subscriptions.services.get_current_subscription')
    def test_grace_period_grants_read_only_pms_access(self, get_subscription):
        profile = self.make_profile('landlord')
        subscription = Mock()
        subscription.status = 'GRACE_PERIOD'
        subscription.id = 'subscription-id'
        subscription.grace_period_end = timezone.now() + timedelta(days=5)
        get_subscription.return_value = subscription

        result = get_pms_access(profile)

        self.assertTrue(result['allowed'])
        self.assertTrue(result['read_only'])
        self.assertEqual(result['subscription_status'], 'GRACE_PERIOD')

    def test_unapproved_real_estate_application_cannot_access_pms(self):
        profile = self.make_profile('real_estate')
        profile.real_estate_application_status = 'pending'

        result = get_pms_access(profile)

        self.assertFalse(result['allowed'])
        self.assertEqual(result['reason'], 'REAL_ESTATE_APPLICATION_NOT_APPROVED')

    def test_unverified_email_cannot_access_pms(self):
        profile = self.make_profile('landlord')
        profile.email_verified = False

        result = get_pms_access(profile)

        self.assertFalse(result['allowed'])
        self.assertEqual(result['reason'], 'EMAIL_VERIFICATION_REQUIRED')
