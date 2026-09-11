from datetime import timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import Profile

from .expiry import GRACE_PERIOD_DAYS, process_subscription_expiry
from .models import LandlordSubscription, SubscriptionInvoice
from .renewal_services import create_mpesa_subscription_renewal
from .payment_services import finalize_mpesa_subscription


class SubscriptionPaymentLifecycleTests(TestCase):
    def make_profile(self):
        return Profile.objects.create(
            email=f"landlord-{uuid4()}@example.com",
            role="landlord",
            verification_status="verified",
            kyc_completed=True,
            landlord_application_status="approved",
            email_verified=True,
            is_active=True,
        )

    def make_subscription(self, profile, **values):
        now = timezone.now()
        defaults = {
            "landlord_id": profile.id,
            "plan_id": uuid4(),
            "billing_cycle": "MONTHLY",
            "status": "PENDING_PAYMENT",
            "current_period_start": now,
            "current_period_end": now,
            "grace_period_end": None,
            "auto_renew": False,
            "created_at": now,
            "updated_at": now,
            "billing_amount_kes": Decimal("1500.00"),
            "billing_amount_usd": Decimal("10.00"),
        }
        defaults.update(values)
        return LandlordSubscription.objects.create(**defaults)

    def make_invoice(self, subscription, **values):
        now = timezone.now()
        defaults = {
            "amount_kes": Decimal("1500.00"),
            "status": "PENDING",
            "payment_provider": "MPESA",
            "payment_method": "MPESA",
            "landlord_subscription_id": subscription.id,
            "currency": "KES",
            "created_at": now,
        }
        defaults.update(values)
        return SubscriptionInvoice.objects.create(**defaults)

    def test_mpesa_success_settles_invoice_and_activates_subscription(self):
        profile = self.make_profile()
        subscription = self.make_subscription(profile)
        invoice = self.make_invoice(subscription, provider_reference="checkout-123")

        with patch("apps.subscriptions.payment_services.publish_payment_status") as publish:
            result = finalize_mpesa_subscription(
                invoice.id,
                result_code=0,
                result_description="Success",
                mpesa_receipt="QAB123456",
                checkout_request_id="checkout-123",
                merchant_request_id="merchant-123",
                paid_amount="1500.00",
            )

        self.assertTrue(result["success"])
        invoice.refresh_from_db()
        subscription.refresh_from_db()
        self.assertEqual(invoice.status, "PAID")
        self.assertEqual(invoice.provider_transaction_id, "QAB123456")
        self.assertEqual(invoice.mpesa_receipt, "QAB123456")
        self.assertEqual(subscription.status, "ACTIVE")
        self.assertIsNotNone(subscription.current_period_end)
        self.assertIsNone(subscription.grace_period_end)
        publish.assert_called_once()

    def test_mpesa_failure_cancels_pending_subscription_but_keeps_invoice_failed(self):
        profile = self.make_profile()
        subscription = self.make_subscription(profile)
        invoice = self.make_invoice(subscription, provider_reference="checkout-456")

        with patch("apps.subscriptions.payment_services.publish_payment_status") as publish:
            result = finalize_mpesa_subscription(
                invoice.id,
                result_code=1032,
                result_description="Request cancelled by user",
                checkout_request_id="checkout-456",
            )

        self.assertFalse(result["success"])
        invoice.refresh_from_db()
        subscription.refresh_from_db()
        self.assertEqual(invoice.status, "FAILED")
        self.assertEqual(invoice.result_code, 1032)
        self.assertEqual(subscription.status, "CANCELLED")
        publish.assert_called_once()

    def test_mpesa_success_is_idempotent_after_invoice_is_paid(self):
        profile = self.make_profile()
        subscription = self.make_subscription(profile)
        invoice = self.make_invoice(subscription, provider_reference="checkout-789")

        with patch("apps.subscriptions.payment_services.publish_payment_status"):
            first = finalize_mpesa_subscription(
                invoice.id,
                result_code=0,
                mpesa_receipt="QAB789456",
                checkout_request_id="checkout-789",
                paid_amount=Decimal("1500.00"),
            )

        with patch("apps.subscriptions.payment_services.publish_payment_status") as publish:
            second = finalize_mpesa_subscription(
                invoice.id,
                result_code=0,
                mpesa_receipt="QAB789456",
                checkout_request_id="checkout-789",
                paid_amount=Decimal("1500.00"),
            )

        self.assertTrue(first["success"])
        self.assertTrue(second["success"])
        self.assertTrue(second["already_settled"])
        publish.assert_not_called()
        invoice.refresh_from_db()
        self.assertEqual(invoice.status, "PAID")

    def test_mpesa_success_rejects_amount_mismatch_without_activation(self):
        profile = self.make_profile()
        subscription = self.make_subscription(profile)
        invoice = self.make_invoice(subscription, provider_reference="checkout-amount")

        with self.assertRaisesMessage(ValueError, "M-Pesa paid amount does not match invoice amount"):
            finalize_mpesa_subscription(
                invoice.id,
                result_code=0,
                mpesa_receipt="QAB000111",
                checkout_request_id="checkout-amount",
                paid_amount=Decimal("1499.00"),
            )

        invoice.refresh_from_db()
        subscription.refresh_from_db()
        self.assertEqual(invoice.status, "PENDING")
        self.assertEqual(subscription.status, "PENDING_PAYMENT")


class SubscriptionRenewalLifecycleTests(TestCase):
    def make_profile(self):
        return Profile.objects.create(
            email=f"renewal-{uuid4()}@example.com",
            role="landlord",
            verification_status="verified",
            kyc_completed=True,
            landlord_application_status="approved",
            email_verified=True,
            is_active=True,
        )

    def test_active_renewal_uses_existing_subscription_and_starts_at_current_period_end(self):
        profile = self.make_profile()
        now = timezone.now()
        period_end = now + timedelta(days=7)
        subscription = LandlordSubscription.objects.create(
            landlord_id=profile.id,
            plan_id=uuid4(),
            billing_cycle="MONTHLY",
            status="ACTIVE",
            current_period_start=now - timedelta(days=23),
            current_period_end=period_end,
            grace_period_end=None,
            auto_renew=True,
            created_at=now - timedelta(days=23),
            updated_at=now,
            billing_amount_kes=Decimal("1500.00"),
            billing_amount_usd=Decimal("10.00"),
        )
        provider_result = SimpleNamespace(
            success=True,
            provider_reference="STK-RENEW-123",
            raw={"CheckoutRequestID": "STK-RENEW-123"},
        )
        provider = SimpleNamespace(create_payment=lambda **kwargs: provider_result)

        with patch("apps.subscriptions.renewal_services.get_provider", return_value=provider):
            result = create_mpesa_subscription_renewal(profile, phone_number="254700000000")

        self.assertTrue(result["success"])
        self.assertEqual(result["subscription_id"], str(subscription.id))
        self.assertTrue(result["renewal"])
        self.assertEqual(LandlordSubscription.objects.filter(landlord_id=profile.id).count(), 1)
        invoice = SubscriptionInvoice.objects.get(pk=result["invoice_id"])
        self.assertEqual(invoice.status, "PENDING")
        self.assertEqual(invoice.billing_period_start, period_end)
        self.assertEqual(invoice.provider_reference, "STK-RENEW-123")


class SubscriptionExpiryLifecycleTests(TestCase):
    def make_subscription(self, status, **values):
        now = timezone.now()
        defaults = {
            "landlord_id": uuid4(),
            "plan_id": uuid4(),
            "billing_cycle": "MONTHLY",
            "status": status,
            "current_period_start": now - timedelta(days=40),
            "current_period_end": now - timedelta(days=10),
            "grace_period_end": None,
            "auto_renew": False,
            "created_at": now - timedelta(days=40),
            "updated_at": now - timedelta(days=40),
            "billing_amount_kes": Decimal("1500.00"),
            "billing_amount_usd": Decimal("10.00"),
        }
        defaults.update(values)
        return LandlordSubscription.objects.create(**defaults)

    def test_expired_active_subscription_enters_five_day_grace_period(self):
        subscription = self.make_subscription("ACTIVE")

        with patch("apps.subscriptions.expiry._queue_lifecycle_notification") as notify:
            result = process_subscription_expiry()

        subscription.refresh_from_db()
        self.assertEqual(subscription.status, "GRACE_PERIOD")
        self.assertEqual(
            subscription.grace_period_end,
            subscription.current_period_end + timedelta(days=GRACE_PERIOD_DAYS),
        )
        self.assertEqual(result["landlord_subscriptions_moved_to_grace"], 1)
        notify.assert_called_once()

    def test_expired_grace_period_subscription_becomes_expired(self):
        subscription = self.make_subscription(
            "GRACE_PERIOD",
            grace_period_end=timezone.now() - timedelta(minutes=1),
        )

        with patch("apps.subscriptions.expiry._queue_lifecycle_notification") as notify:
            result = process_subscription_expiry()

        subscription.refresh_from_db()
        self.assertEqual(subscription.status, "EXPIRED")
        self.assertIsNone(subscription.grace_period_end)
        self.assertEqual(result["landlord_subscriptions_expired"], 1)
        notify.assert_called_once()
