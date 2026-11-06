from django.core import signing
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from .models import SubscriptionInvoice


class PayPalReturnStatusTests(TestCase):
    def setUp(self):
        self.invoice = SubscriptionInvoice.objects.create(
            amount_kes=1500,
            status='PAID',
            created_at=timezone.now(),
            payment_provider='PAYPAL',
            payment_method='PAYPAL',
            currency='USD',
            amount_usd='11.25',
        )
        self.token = signing.dumps(
            {'invoice_id': str(self.invoice.id), 'client_platform': 'android', 'plan_name': 'GROWTH', 'billing_cycle': 'ANNUAL'},
            salt='sakakrib.paypal-subscription-return',
            compress=True,
        )
        self.client = APIClient()

    def test_signed_return_token_exposes_final_status_without_authentication(self):
        response = self.client.get(
            '/api/subscriptions/paypal/return-status/',
            {'state': self.token},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['status'], 'PAID')
        self.assertEqual(response.data['invoice_id'], str(self.invoice.id))
        self.assertNotIn('listing_id', response.data)
        self.assertEqual(response.data['client_platform'], 'android')
        self.assertEqual(response.data['plan_name'], 'GROWTH')
        self.assertEqual(response.data['billing_cycle'], 'ANNUAL')

    def test_invalid_return_token_is_rejected(self):
        response = self.client.get(
            '/api/subscriptions/paypal/return-status/',
            {'state': 'not-a-valid-token'},
        )

        self.assertEqual(response.status_code, 400)

    def test_return_token_cannot_read_non_paypal_invoice(self):
        self.invoice.payment_provider = 'MPESA'
        self.invoice.save(update_fields=['payment_provider'])

        response = self.client.get(
            '/api/subscriptions/paypal/return-status/',
            {'state': self.token},
        )

        self.assertEqual(response.status_code, 404)

    def test_signed_return_state_authorizes_paypal_approval_without_session(self):
        pending = SubscriptionInvoice.objects.create(
            amount_kes=1500,
            status='PENDING',
            created_at=timezone.now(),
            payment_provider='PAYPAL',
            payment_method='PAYPAL',
            currency='USD',
            amount_usd='11.25',
        )
        token = signing.dumps(
            {'invoice_id': str(pending.id)},
            salt='sakakrib.paypal-subscription-return',
            compress=True,
        )

        with patch(
            'apps.subscriptions.views.record_paypal_subscription_approval',
            return_value={'success': True, 'status': 'PENDING_PAYMENT'},
        ) as approve:
            response = self.client.post(
                '/api/subscriptions/paypal/approve/',
                {
                    'invoice_id': str(pending.id),
                    'paypal_subscription_id': 'I-APPROVED',
                    'state': token,
                },
                format='json',
            )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['success'])
        approve.assert_called_once_with(pending.id, 'I-APPROVED')

    def test_signed_return_state_cannot_authorize_a_different_invoice(self):
        pending = SubscriptionInvoice.objects.create(
            amount_kes=1500,
            status='PENDING',
            created_at=timezone.now(),
            payment_provider='PAYPAL',
            payment_method='PAYPAL',
            currency='USD',
            amount_usd='11.25',
        )

        with patch('apps.subscriptions.views.record_paypal_subscription_approval') as approve:
            response = self.client.post(
                '/api/subscriptions/paypal/approve/',
                {
                    'invoice_id': str(pending.id),
                    'paypal_subscription_id': 'I-APPROVED',
                    'state': self.token,
                },
                format='json',
            )

        self.assertEqual(response.status_code, 400)
        approve.assert_not_called()
    def test_paypal_subscription_webhook_accepts_canonical_and_legacy_paths(self):
        payload = {'id': 'WH-TEST-EVENT', 'event_type': 'BILLING.SUBSCRIPTION.ACTIVATED', 'resource': {'id': 'I-TEST'}}
        with patch('apps.subscriptions.views.verify_paypal_webhook') as verify, patch(
            'apps.subscriptions.views.process_paypal_subscription_webhook',
            return_value={'status': 'PROCESSED', 'event_id': 'WH-TEST-EVENT'},
        ) as process:
            for path in (
                '/api/subscriptions/paypal/webhook/',
                '/api/subscriptions/callbacks/paypal/',
            ):
                response = self.client.post(path, payload, format='json')
                self.assertEqual(response.status_code, 200, path)
                self.assertTrue(response.data['success'], path)

        self.assertEqual(verify.call_count, 2)
        self.assertEqual(process.call_count, 2)
