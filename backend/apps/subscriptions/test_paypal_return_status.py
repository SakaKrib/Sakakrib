from django.core import signing
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
            {'invoice_id': str(self.invoice.id)},
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
