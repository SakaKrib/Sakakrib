from decimal import Decimal
from unittest.mock import Mock, patch
from uuid import uuid4

from django.test import SimpleTestCase

from .payment_services import _period_end, _paypal_return_url, finalize_mpesa_subscription, finalize_paypal_subscription


class SubscriptionPaymentSecurityTests(SimpleTestCase):
    def test_paypal_return_url_binds_invoice_id(self):
        url = _paypal_return_url('https://app.example.com/paypal/return?source=paypal', uuid4())
        self.assertIn('source=paypal', url)
        self.assertIn('invoice_id=', url)

    @patch('apps.subscriptions.payment_services.verify_and_finalize_initial_subscription', create=True)
    def test_paypal_finalization_delegates_to_remote_verification(self, verifier):
        # The verifier is imported lazily by finalize_paypal_subscription.
        with patch('apps.subscriptions.paypal_subscription_services.verify_and_finalize_initial_subscription', return_value={'success': True, 'status': 'PAID'}) as remote:
            result = finalize_paypal_subscription(uuid4(), 'I-REMOTE-SUBSCRIPTION')
        self.assertEqual(result['status'], 'PAID')
        remote.assert_called_once()

    @patch('apps.subscriptions.payment_services._activate_invoice')
    @patch('apps.subscriptions.payment_services.SubscriptionInvoice.objects')
    def test_successful_mpesa_settlement_requires_provider_amount_and_receipt(self, objects, activate):
        invoice = Mock()
        invoice.status = 'PENDING'
        invoice.amount_kes = Decimal('1500.00')
        invoice.payment_provider = 'MPESA'
        invoice.provider_reference = 'CHK-123'
        invoice.landlord_subscription_id = uuid4()
        invoice.real_estate_subscription_id = None
        objects.select_for_update.return_value.filter.return_value.first.return_value = invoice

        with self.assertRaises(ValueError):
            finalize_mpesa_subscription(
                invoice.id,
                0,
                mpesa_receipt=None,
                checkout_request_id='CHK-123',
                paid_amount=None,
            )
        activate.assert_not_called()

    def test_period_end_is_positive_for_monthly_and_annual(self):
        from django.utils import timezone
        start = timezone.now()
        self.assertGreater(_period_end(start, 'MONTHLY'), start)
        self.assertGreater(_period_end(start, 'ANNUAL'), start)
