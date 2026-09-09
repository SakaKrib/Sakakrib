from datetime import datetime, timedelta, timezone as dt_timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import Mock, patch
from uuid import uuid4

from django.test import TestCase
from django.utils import timezone

from .payment_services import _activate_invoice
from .renewal_services import create_mpesa_subscription_renewal


class SubscriptionRenewalTests(TestCase):
    def make_profile(self, role='landlord'):
        profile = Mock()
        profile.id = uuid4()
        profile.role = role
        profile.verification_status = 'verified'
        profile.email_verified = True
        profile.landlord_application_status = 'approved'
        profile.real_estate_application_status = 'approved'
        profile.phone = '+254700000000'
        return profile

    @patch('apps.subscriptions.renewal_services.get_provider')
    @patch('apps.subscriptions.renewal_services.SubscriptionInvoice.objects')
    @patch('apps.subscriptions.renewal_services.LandlordSubscription.objects')
    @patch('apps.subscriptions.renewal_services.get_current_subscription')
    def test_active_mpesa_renewal_uses_existing_subscription(self, get_current_subscription, subscription_objects, invoice_objects, get_provider):
        profile = self.make_profile()
        subscription_id = uuid4()
        plan_id = uuid4()
        period_end = timezone.now() + timedelta(days=3)
        subscription = SimpleNamespace(id=subscription_id, plan_id=plan_id, status='ACTIVE', billing_amount_kes=Decimal('1500.00'), billing_cycle='MONTHLY', current_period_end=period_end)
        locked = SimpleNamespace(id=subscription_id, plan_id=plan_id, status='ACTIVE', billing_amount_kes=Decimal('1500.00'), billing_cycle='MONTHLY', current_period_end=period_end)
        invoice = Mock(id=uuid4())
        provider_result = SimpleNamespace(success=True, message='STK sent', provider_reference='ws_CO_123', raw={'CheckoutRequestID': 'ws_CO_123'})
        get_current_subscription.return_value = subscription
        subscription_objects.select_for_update.return_value.get.return_value = locked
        invoice_objects.filter.return_value.order_by.return_value.first.return_value = None
        invoice_objects.create.return_value = invoice
        get_provider.return_value.create_payment.return_value = provider_result
        result = create_mpesa_subscription_renewal(profile, profile.phone)
        self.assertTrue(result['success'])
        self.assertTrue(result['renewal'])
        self.assertEqual(result['subscription_id'], str(subscription_id))
        invoice_objects.create.assert_called_once()
        create_kwargs = invoice_objects.create.call_args.kwargs
        self.assertEqual(create_kwargs['landlord_subscription_id'], subscription_id)
        self.assertEqual(create_kwargs['billing_period_start'], period_end)
        get_provider.return_value.create_payment.assert_called_once()

    @patch('apps.subscriptions.renewal_services.get_current_subscription')
    def test_renewal_rejects_missing_current_subscription(self, get_current_subscription):
        get_current_subscription.return_value = None
        with self.assertRaisesMessage(ValueError, 'No active or grace-period subscription is available for renewal'):
            profile = self.make_profile()
            create_mpesa_subscription_renewal(profile, profile.phone)

    @patch('apps.subscriptions.payment_services.timezone.now')
    @patch('apps.subscriptions.payment_services.LandlordSubscription.objects')
    def test_active_payment_renewal_preserves_remaining_paid_period(self, subscription_objects, now):
        fixed_now = datetime(2026, 1, 1, tzinfo=dt_timezone.utc)
        existing_end = fixed_now + timedelta(days=10)
        now.return_value = fixed_now
        subscription = Mock(id=uuid4(), status='ACTIVE', current_period_end=existing_end, billing_cycle='MONTHLY', landlord_id=uuid4(), real_estate_id=None)
        invoice = Mock(landlord_subscription_id=subscription.id, real_estate_subscription_id=None, listing_id=None, amount_kes=Decimal('1500.00'))
        subscription_objects.select_for_update.return_value.get.return_value = subscription
        result = _activate_invoice(invoice, provider='MPESA', provider_reference='ws_CO_123', transaction_id='QWERTY123')
        self.assertTrue(result['success'])
        self.assertEqual(invoice.billing_period_start, existing_end)
        self.assertEqual(subscription.current_period_start, existing_end)
        self.assertGreater(subscription.current_period_end, existing_end)

    @patch('apps.subscriptions.payment_services.timezone.now')
    @patch('apps.subscriptions.payment_services.LandlordSubscription.objects')
    def test_grace_period_payment_renewal_starts_now(self, subscription_objects, now):
        fixed_now = datetime(2026, 1, 1, tzinfo=dt_timezone.utc)
        expired_end = fixed_now - timedelta(days=2)
        now.return_value = fixed_now
        subscription = Mock(id=uuid4(), status='GRACE_PERIOD', current_period_end=expired_end, billing_cycle='MONTHLY', landlord_id=uuid4(), real_estate_id=None)
        invoice = Mock(landlord_subscription_id=subscription.id, real_estate_subscription_id=None, listing_id=None, amount_kes=Decimal('1500.00'))
        subscription_objects.select_for_update.return_value.get.return_value = subscription
        result = _activate_invoice(invoice, provider='MPESA', provider_reference='ws_CO_456', transaction_id='QWERTY456')
        self.assertTrue(result['success'])
        self.assertEqual(invoice.billing_period_start, fixed_now)
        self.assertEqual(subscription.current_period_start, fixed_now)
