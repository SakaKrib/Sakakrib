from datetime import timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import Mock, patch
from uuid import uuid4

from django.test import SimpleTestCase
from django.utils import timezone

from .upgrade_services import create_mpesa_subscription_upgrade, finalize_mpesa_subscription_upgrade


class SubscriptionUpgradeTests(SimpleTestCase):
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

    @patch('apps.subscriptions.upgrade_services.get_provider')
    @patch('apps.subscriptions.upgrade_services.SubscriptionInvoice.objects')
    @patch('apps.subscriptions.upgrade_services.SubscriptionListing.objects')
    @patch('apps.subscriptions.upgrade_services.SubscriptionPlan.objects')
    @patch('apps.subscriptions.upgrade_services.LandlordSubscription.objects')
    @patch('apps.subscriptions.upgrade_services.get_current_subscription')
    def test_mpesa_upgrade_creates_invoice_against_existing_subscription(
        self,
        get_current_subscription,
        subscription_objects,
        plan_objects,
        listing_objects,
        invoice_objects,
        get_provider,
    ):
        profile = self.make_profile()
        subscription_id = uuid4()
        current_plan_id = uuid4()
        target_plan_id = uuid4()
        current = SimpleNamespace(
            id=subscription_id,
            plan_id=current_plan_id,
            status='ACTIVE',
            billing_cycle='MONTHLY',
            paypal_subscription_id=None,
        )
        current_plan = SimpleNamespace(id=current_plan_id, name='STARTER', monthly_price_kes=Decimal('500.00'), annual_price_kes=Decimal('5000.00'))
        target_plan = SimpleNamespace(id=target_plan_id, name='GROWTH', monthly_price_kes=Decimal('1500.00'), annual_price_kes=Decimal('15000.00'), max_listings=20)
        locked = SimpleNamespace(
            id=subscription_id,
            plan_id=current_plan_id,
            status='ACTIVE',
            billing_cycle='MONTHLY',
            paypal_subscription_id=None,
            current_period_start=timezone.now() - timedelta(days=5),
            current_period_end=timezone.now() + timedelta(days=25),
        )
        invoice = Mock(id=uuid4())
        provider_result = SimpleNamespace(success=True, provider_reference='ws_CO_UPGRADE', raw={'CheckoutRequestID': 'ws_CO_UPGRADE'})

        get_current_subscription.return_value = current
        plan_objects.filter.side_effect = [SimpleNamespace(first=lambda: current_plan), SimpleNamespace(first=lambda: target_plan), SimpleNamespace(first=lambda: current_plan), SimpleNamespace(first=lambda: target_plan)]
        subscription_objects.select_for_update.return_value.get.return_value = locked
        listing_objects.filter.return_value.count.return_value = 3
        invoice_objects.filter.return_value.order_by.return_value.first.return_value = None
        invoice_objects.create.return_value = invoice
        get_provider.return_value.create_payment.return_value = provider_result

        result = create_mpesa_subscription_upgrade(profile, target_plan_id, 'MONTHLY')

        self.assertTrue(result['success'])
        self.assertTrue(result['upgrade'])
        self.assertEqual(result['subscription_id'], str(subscription_id))
        self.assertEqual(result['amount_kes'], Decimal('1000.00'))
        create_kwargs = invoice_objects.create.call_args.kwargs
        self.assertEqual(create_kwargs['landlord_subscription_id'], subscription_id)
        self.assertEqual(create_kwargs['upgrade_plan_id'], target_plan_id)

    @patch('apps.subscriptions.upgrade_services.timezone.now')
    @patch('apps.subscriptions.upgrade_services.SubscriptionPlan.objects')
    @patch('apps.subscriptions.upgrade_services.LandlordSubscription.objects')
    @patch('apps.subscriptions.upgrade_services.SubscriptionInvoice.objects')
    def test_paid_upgrade_changes_plan_but_preserves_subscription_and_period(
        self,
        invoice_objects,
        subscription_objects,
        plan_objects,
        now,
    ):
        fixed_now = timezone.now()
        period_start = fixed_now - timedelta(days=10)
        period_end = fixed_now + timedelta(days=20)
        now.return_value = fixed_now
        subscription_id = uuid4()
        target_plan_id = uuid4()
        invoice = Mock(
            status='PENDING',
            upgrade_plan_id=target_plan_id,
            payment_provider='MPESA',
            amount_kes=Decimal('1000.00'),
            landlord_subscription_id=subscription_id,
            real_estate_subscription_id=None,
            provider_reference='ws_CO_UPGRADE',
            id=uuid4(),
        )
        subscription = Mock(
            id=subscription_id,
            landlord_id=uuid4(),
            status='ACTIVE',
            current_period_start=period_start,
            current_period_end=period_end,
            billing_cycle='MONTHLY',
        )
        target_plan = SimpleNamespace(
            id=target_plan_id,
            name='GROWTH',
            annual_price_kes=Decimal('15000.00'),
            monthly_price_kes=Decimal('1500.00'),
            paypal_annual_price_usd=None,
            paypal_monthly_price_usd=None,
        )

        invoice_objects.select_for_update.return_value.filter.return_value.first.return_value = invoice
        subscription_objects.select_for_update.return_value.get.return_value = subscription
        plan_objects.select_for_update.return_value.filter.return_value.first.return_value = target_plan

        result = finalize_mpesa_subscription_upgrade(
            invoice.id,
            0,
            'Success',
            mpesa_receipt='UPGRADE123',
            checkout_request_id='ws_CO_UPGRADE',
            paid_amount='1000.00',
        )

        self.assertTrue(result['success'])
        self.assertEqual(result['subscription_id'], str(subscription_id))
        self.assertEqual(subscription.plan_id, target_plan_id)
        self.assertEqual(subscription.current_period_start, period_start)
        self.assertEqual(subscription.current_period_end, period_end)
        self.assertEqual(subscription.billing_amount_kes, Decimal('1500.00'))

    @patch('apps.subscriptions.upgrade_services.SubscriptionInvoice.objects')
    def test_failed_upgrade_does_not_change_subscription(self, invoice_objects):
        subscription_id = uuid4()
        invoice = Mock(
            status='PENDING',
            upgrade_plan_id=uuid4(),
            payment_provider='MPESA',
            landlord_subscription_id=subscription_id,
            real_estate_subscription_id=None,
            id=uuid4(),
        )
        subscription = Mock(id=subscription_id, landlord_id=uuid4(), status='ACTIVE', plan_id=uuid4())
        invoice_objects.select_for_update.return_value.filter.return_value.first.return_value = invoice

        with patch('apps.subscriptions.upgrade_services.LandlordSubscription.objects') as subscription_objects:
            subscription_objects.select_for_update.return_value.get.return_value = subscription
            result = finalize_mpesa_subscription_upgrade(invoice.id, 1032, 'Request cancelled')

        self.assertFalse(result['success'])
        self.assertEqual(subscription.status, 'ACTIVE')
        self.assertEqual(invoice.status, 'FAILED')
