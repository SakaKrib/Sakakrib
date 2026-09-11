from datetime import timedelta
from unittest.mock import patch
from uuid import uuid4

from django.test import TestCase
from django.utils import timezone

from .models import LandlordSubscription, SubscriptionInvoice
from .paypal_subscription_services import record_paypal_subscription_approval


class PayPalSubscriptionApprovalTests(TestCase):
    def setUp(self):
        now = timezone.now()
        self.subscription = LandlordSubscription.objects.create(
            landlord_id=uuid4(),
            plan_id=uuid4(),
            billing_cycle='MONTHLY',
            status='PENDING_PAYMENT',
            current_period_start=now,
            current_period_end=now + timedelta(days=30),
            grace_period_end=None,
            auto_renew=False,
            created_at=now,
            updated_at=now,
            paypal_plan_id='P-TESTPLAN',
        )
        self.invoice = SubscriptionInvoice.objects.create(
            amount_kes=1000,
            status='PENDING',
            created_at=now,
            payment_provider='PAYPAL',
            payment_method='PAYPAL',
            landlord_subscription_id=self.subscription.id,
            currency='USD',
            amount_usd='7.50',
        )

    @patch('apps.subscriptions.paypal_subscription_services._paypal_token', return_value='test-token')
    @patch('apps.subscriptions.paypal_subscription_services._paypal_json')
    def test_rejects_paypal_subscription_bound_to_another_invoice(self, paypal_json, _token):
        paypal_json.return_value = {
            'id': 'I-TEST-SUBSCRIPTION',
            'plan_id': 'P-TESTPLAN',
            'custom_id': str(uuid4()),
            'status': 'APPROVAL_PENDING',
        }

        with self.assertRaisesRegex(ValueError, 'not bound to the selected SakaKrib invoice'):
            record_paypal_subscription_approval(str(self.invoice.id), 'I-TEST-SUBSCRIPTION')

        self.subscription.refresh_from_db()
        self.invoice.refresh_from_db()
        self.assertIsNone(self.subscription.paypal_subscription_id)
        self.assertIsNone(self.invoice.paypal_subscription_id)
        self.assertIsNone(self.invoice.provider_reference)

    @patch('apps.subscriptions.paypal_subscription_services._paypal_token', return_value='test-token')
    @patch('apps.subscriptions.paypal_subscription_services._paypal_json')
    def test_accepts_paypal_subscription_bound_to_same_invoice(self, paypal_json, _token):
        paypal_json.return_value = {
            'id': 'I-TEST-SUBSCRIPTION',
            'plan_id': 'P-TESTPLAN',
            'custom_id': str(self.invoice.id),
            'status': 'APPROVAL_PENDING',
        }

        result = record_paypal_subscription_approval(str(self.invoice.id), 'I-TEST-SUBSCRIPTION')

        self.subscription.refresh_from_db()
        self.invoice.refresh_from_db()
        self.assertTrue(result['success'])
        self.assertEqual(self.subscription.paypal_subscription_id, 'I-TEST-SUBSCRIPTION')
        self.assertEqual(self.invoice.paypal_subscription_id, 'I-TEST-SUBSCRIPTION')
        self.assertEqual(self.invoice.provider_reference, 'I-TEST-SUBSCRIPTION')
