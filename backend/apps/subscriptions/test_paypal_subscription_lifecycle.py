from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch
from uuid import uuid4

from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import Profile
from apps.core.domain_platform import PaymentWebhookEvent

from .models import LandlordSubscription, SubscriptionInvoice, SubscriptionPlan
from .paypal_subscription_services import process_paypal_subscription_webhook
from .paypal_upgrade_services import (
    confirm_paypal_subscription_upgrade,
    process_paypal_subscription_webhook as process_paypal_upgrade_webhook,
)


class PayPalSubscriptionLifecycleTests(TestCase):
    def make_profile(self):
        return Profile.objects.create(
            email=f"paypal-{uuid4()}@example.com",
            role="landlord",
            verification_status="verified",
            kyc_completed=True,
            landlord_application_status="approved",
            email_verified=True,
            is_active=True,
        )

    def make_plan(self, name="Growth", **values):
        now = timezone.now()
        defaults = {
            "name": name,
            "max_units_per_listing": 20,
            "monthly_price_kes": Decimal("1500.00"),
            "annual_price_kes": Decimal("15000.00"),
            "created_at": now,
            "max_listings": 20,
            "audience": "LANDLORD",
            "paypal_product_id": "PROD-TEST",
            "paypal_monthly_plan_id": "P-MONTHLY-TEST",
            "paypal_annual_plan_id": "P-ANNUAL-TEST",
            "paypal_monthly_price_usd": Decimal("10.00"),
            "paypal_annual_price_usd": Decimal("100.00"),
            "paypal_fx_rate": Decimal("150.00000000"),
            "paypal_fx_rate_timestamp": now,
        }
        defaults.update(values)
        return SubscriptionPlan.objects.create(**defaults)

    def make_subscription(self, profile, plan, **values):
        now = timezone.now()
        defaults = {
            "landlord_id": profile.id,
            "plan_id": plan.id,
            "billing_cycle": "MONTHLY",
            "status": "ACTIVE",
            "current_period_start": now - timedelta(days=20),
            "current_period_end": now + timedelta(days=10),
            "grace_period_end": None,
            "auto_renew": True,
            "created_at": now - timedelta(days=20),
            "updated_at": now,
            "paypal_subscription_id": "I-TEST-SUBSCRIPTION",
            "paypal_plan_id": plan.paypal_monthly_plan_id,
            "paypal_status": "ACTIVE",
            "next_billing_at": now + timedelta(days=10),
            "cancel_at_period_end": False,
            "billing_amount_kes": plan.monthly_price_kes,
            "billing_amount_usd": plan.paypal_monthly_price_usd,
            "billing_exchange_rate": plan.paypal_fx_rate,
            "billing_exchange_rate_timestamp": now,
        }
        defaults.update(values)
        return LandlordSubscription.objects.create(**defaults)

    def make_invoice(self, subscription, **values):
        now = timezone.now()
        defaults = {
            "amount_kes": Decimal("1500.00"),
            "amount_usd": Decimal("10.00"),
            "currency": "USD",
            "status": "PENDING",
            "payment_provider": "PAYPAL",
            "payment_method": "PAYPAL",
            "paypal_subscription_id": subscription.paypal_subscription_id,
            "landlord_subscription_id": subscription.id,
            "created_at": now,
        }
        defaults.update(values)
        return SubscriptionInvoice.objects.create(**defaults)

    def sale_payload(self, event_id="PAYPAL-EVENT-1", sale_id="SALE-1", amount="10.00"):
        return {
            "id": event_id,
            "event_type": "PAYMENT.SALE.COMPLETED",
            "summary": "Subscription payment completed",
            "resource": {
                "id": sale_id,
                "billing_agreement_id": "I-TEST-SUBSCRIPTION",
                "amount": {"currency": "USD", "total": amount},
                "billing_info": {
                    "next_billing_time": (timezone.now() + timedelta(days=30)).isoformat()
                },
            },
        }

    def test_recurring_sale_creates_paid_invoice(self):
        profile = self.make_profile()
        plan = self.make_plan()
        subscription = self.make_subscription(profile, plan)

        with patch("apps.subscriptions.paypal_subscription_services.publish_payment_status") as publish:
            with self.captureOnCommitCallbacks(execute=True):
                result = process_paypal_subscription_webhook(self.sale_payload())

        self.assertEqual(result["status"], "PAID")
        invoice = SubscriptionInvoice.objects.get(webhook_event_id="PAYPAL-EVENT-1")
        subscription.refresh_from_db()
        self.assertEqual(invoice.status, "PAID")
        self.assertEqual(invoice.provider_reference, "SALE-1")
        self.assertEqual(invoice.provider_transaction_id, "SALE-1")
        self.assertEqual(invoice.amount_usd, Decimal("10.00"))
        self.assertEqual(subscription.status, "ACTIVE")
        self.assertEqual(subscription.paypal_status, "ACTIVE")
        publish.assert_called_once()

    def test_pending_paypal_invoice_is_settled_without_creating_duplicate(self):
        profile = self.make_profile()
        plan = self.make_plan()
        subscription = self.make_subscription(profile, plan, status="PENDING_PAYMENT")
        invoice = self.make_invoice(subscription, provider_reference=subscription.paypal_subscription_id)

        with patch("apps.subscriptions.paypal_subscription_services.publish_payment_status"):
            with self.captureOnCommitCallbacks(execute=True):
                result = process_paypal_subscription_webhook(
                    self.sale_payload(event_id="PAYPAL-EVENT-PENDING", sale_id="SALE-PENDING")
                )

        invoice.refresh_from_db()
        subscription.refresh_from_db()
        self.assertEqual(result["invoice_id"], str(invoice.id))
        self.assertEqual(SubscriptionInvoice.objects.filter(landlord_subscription_id=subscription.id).count(), 1)
        self.assertEqual(invoice.status, "PAID")
        self.assertEqual(invoice.provider_reference, subscription.paypal_subscription_id)
        self.assertEqual(invoice.provider_transaction_id, "SALE-PENDING")
        self.assertEqual(subscription.status, "ACTIVE")

    def test_preapproval_cancellation_closes_pending_invoice_and_publishes_status(self):
        profile = self.make_profile()
        plan = self.make_plan()
        subscription = self.make_subscription(
            profile,
            plan,
            status="PENDING_PAYMENT",
            paypal_status="APPROVAL_PENDING",
            auto_renew=False,
        )
        invoice = self.make_invoice(subscription)
        payload = {
            "id": "PAYPAL-EVENT-CANCEL-PENDING",
            "event_type": "BILLING.SUBSCRIPTION.CANCELLED",
            "summary": "Buyer cancelled checkout",
            "resource": {"id": subscription.paypal_subscription_id},
        }

        with patch("apps.subscriptions.paypal_subscription_services.publish_payment_status") as publish:
            with self.captureOnCommitCallbacks(execute=True):
                result = process_paypal_subscription_webhook(payload)

        invoice.refresh_from_db()
        subscription.refresh_from_db()
        self.assertEqual(result["status"], "CANCELLED")
        self.assertEqual(invoice.status, "CANCELLED")
        self.assertEqual(invoice.webhook_event_id, "PAYPAL-EVENT-CANCEL-PENDING")
        self.assertEqual(subscription.status, "CANCELLED")
        publish.assert_called_once()

    def test_sale_after_cancel_event_settles_the_original_invoice(self):
        profile = self.make_profile()
        plan = self.make_plan()
        subscription = self.make_subscription(
            profile,
            plan,
            status="PENDING_PAYMENT",
            paypal_status="APPROVAL_PENDING",
            auto_renew=False,
        )
        invoice = self.make_invoice(subscription)

        cancel_payload = {
            "id": "PAYPAL-EVENT-CANCEL-BEFORE-SALE",
            "event_type": "BILLING.SUBSCRIPTION.CANCELLED",
            "summary": "Checkout cancellation notification",
            "resource": {"id": subscription.paypal_subscription_id},
        }
        with patch("apps.subscriptions.paypal_subscription_services.publish_payment_status"):
            with self.captureOnCommitCallbacks(execute=True):
                process_paypal_subscription_webhook(cancel_payload)

        with patch("apps.subscriptions.paypal_subscription_services.publish_payment_status"):
            with self.captureOnCommitCallbacks(execute=True):
                result = process_paypal_subscription_webhook(
                    self.sale_payload(
                        event_id="PAYPAL-EVENT-SALE-AFTER-CANCEL",
                        sale_id="SALE-AFTER-CANCEL",
                    )
                )

        invoice.refresh_from_db()
        subscription.refresh_from_db()
        self.assertEqual(result["status"], "PAID")
        self.assertEqual(result["invoice_id"], str(invoice.id))
        self.assertEqual(invoice.status, "PAID")
        self.assertEqual(invoice.provider_transaction_id, "SALE-AFTER-CANCEL")
        self.assertEqual(subscription.status, "ACTIVE")

    def test_later_payment_failure_does_not_overwrite_a_paid_invoice(self):
        profile = self.make_profile()
        plan = self.make_plan()
        subscription = self.make_subscription(profile, plan)
        invoice = self.make_invoice(subscription, status="PAID", webhook_event_id="PREVIOUS-PAID-EVENT")
        payload = {
            "id": "PAYPAL-EVENT-LATER-FAILURE",
            "event_type": "BILLING.SUBSCRIPTION.PAYMENT.FAILED",
            "summary": "A later renewal attempt failed",
            "resource": {"id": subscription.paypal_subscription_id},
        }

        with patch("apps.subscriptions.paypal_subscription_services.publish_payment_status"):
            with self.captureOnCommitCallbacks(execute=True):
                process_paypal_subscription_webhook(payload)

        invoice.refresh_from_db()
        self.assertEqual(invoice.status, "PAID")
        self.assertEqual(invoice.webhook_event_id, "PREVIOUS-PAID-EVENT")

    def test_same_paypal_webhook_event_is_idempotent(self):
        profile = self.make_profile()
        plan = self.make_plan()
        subscription = self.make_subscription(profile, plan)
        payload = self.sale_payload(event_id="PAYPAL-EVENT-IDEMPOTENT", sale_id="SALE-IDEMPOTENT")

        with patch("apps.subscriptions.paypal_subscription_services.publish_payment_status"):
            with self.captureOnCommitCallbacks(execute=True):
                first = process_paypal_subscription_webhook(payload)

        with patch("apps.subscriptions.paypal_subscription_services.publish_payment_status") as publish:
            with self.captureOnCommitCallbacks(execute=True):
                second = process_paypal_subscription_webhook(payload)

        self.assertEqual(first["status"], "PAID")
        self.assertEqual(second["status"], "ALREADY_PROCESSED")
        self.assertEqual(
            SubscriptionInvoice.objects.filter(landlord_subscription_id=subscription.id).count(),
            1,
        )
        self.assertEqual(
            PaymentWebhookEvent.objects.filter(
                provider="PAYPAL_SUBSCRIPTION", event_id="PAYPAL-EVENT-IDEMPOTENT"
            ).count(),
            1,
        )
        publish.assert_not_called()

    def test_recurring_sale_amount_mismatch_is_rejected(self):
        profile = self.make_profile()
        plan = self.make_plan()
        subscription = self.make_subscription(profile, plan)

        with self.assertRaisesMessage(
            ValueError,
            "PayPal recurring payment amount does not match the subscription price",
        ):
            process_paypal_subscription_webhook(
                self.sale_payload(event_id="PAYPAL-EVENT-MISMATCH", sale_id="SALE-MISMATCH", amount="9.00")
            )

        subscription.refresh_from_db()
        self.assertEqual(subscription.status, "ACTIVE")
        self.assertEqual(
            SubscriptionInvoice.objects.filter(landlord_subscription_id=subscription.id).count(),
            0,
        )


class PayPalUpgradeLifecycleTests(TestCase):
    def make_profile(self):
        return Profile.objects.create(
            email=f"paypal-upgrade-{uuid4()}@example.com",
            role="landlord",
            verification_status="verified",
            kyc_completed=True,
            landlord_application_status="approved",
            email_verified=True,
            is_active=True,
        )

    def make_plan(self, name, monthly_price, monthly_usd, monthly_paypal_id):
        now = timezone.now()
        return SubscriptionPlan.objects.create(
            name=name,
            max_units_per_listing=20,
            monthly_price_kes=Decimal(monthly_price),
            annual_price_kes=Decimal("15000.00"),
            created_at=now,
            max_listings=20,
            audience="LANDLORD",
            paypal_product_id=f"PROD-{name.upper()}",
            paypal_monthly_plan_id=monthly_paypal_id,
            paypal_annual_plan_id=f"P-ANNUAL-{name.upper()}",
            paypal_monthly_price_usd=Decimal(monthly_usd),
            paypal_annual_price_usd=Decimal("100.00"),
            paypal_fx_rate=Decimal("150.00000000"),
            paypal_fx_rate_timestamp=now,
        )

    def make_subscription(self, profile, plan):
        now = timezone.now()
        return LandlordSubscription.objects.create(
            landlord_id=profile.id,
            plan_id=plan.id,
            billing_cycle="MONTHLY",
            status="ACTIVE",
            current_period_start=now - timedelta(days=20),
            current_period_end=now + timedelta(days=10),
            grace_period_end=None,
            auto_renew=True,
            created_at=now - timedelta(days=20),
            updated_at=now,
            paypal_subscription_id="I-UPGRADE-SUBSCRIPTION",
            paypal_plan_id=plan.paypal_monthly_plan_id,
            paypal_status="ACTIVE",
            next_billing_at=now + timedelta(days=10),
            cancel_at_period_end=False,
            billing_amount_kes=plan.monthly_price_kes,
            billing_amount_usd=plan.paypal_monthly_price_usd,
            billing_exchange_rate=plan.paypal_fx_rate,
            billing_exchange_rate_timestamp=now,
        )

    def make_upgrade_invoice(self, subscription, target_plan):
        return SubscriptionInvoice.objects.create(
            amount_kes=target_plan.monthly_price_kes,
            amount_usd=target_plan.paypal_monthly_price_usd,
            currency="USD",
            status="PENDING",
            payment_provider="PAYPAL",
            payment_method="PAYPAL",
            paypal_subscription_id=subscription.paypal_subscription_id,
            landlord_subscription_id=subscription.id,
            upgrade_plan_id=target_plan.id,
            upgrade_billing_cycle="MONTHLY",
            created_at=timezone.now(),
        )

    def upgrade_details(self, target_plan):
        return {
            "id": "I-UPGRADE-SUBSCRIPTION",
            "status": "ACTIVE",
            "plan_id": target_plan.paypal_monthly_plan_id,
            "billing_info": {
                "next_billing_time": (timezone.now() + timedelta(days=30)).isoformat()
            },
        }

    def upgrade_sale_payload(self, invoice, sale_id="SALE-UPGRADE-1", event_id="PAYPAL-UPGRADE-EVENT-1"):
        return {
            "id": event_id,
            "event_type": "PAYMENT.SALE.COMPLETED",
            "summary": "Upgrade payment completed",
            "resource": {
                "id": sale_id,
                "billing_agreement_id": "I-UPGRADE-SUBSCRIPTION",
                "amount": {"currency": "USD", "total": str(invoice.amount_usd)},
                "billing_info": {
                    "next_billing_time": (timezone.now() + timedelta(days=30)).isoformat()
                },
            },
        }

    def test_paypal_upgrade_confirmation_schedules_without_changing_local_plan(self):
        profile = self.make_profile()
        current_plan = self.make_plan("Starter", "500.00", "4.00", "P-STARTER-MONTHLY")
        target_plan = self.make_plan("Growth", "1500.00", "10.00", "P-GROWTH-MONTHLY")
        subscription = self.make_subscription(profile, current_plan)
        invoice = self.make_upgrade_invoice(subscription, target_plan)

        with patch(
            "apps.subscriptions.paypal_upgrade_services._paypal_token", return_value="token"
        ), patch(
            "apps.subscriptions.paypal_upgrade_services._paypal_json",
            return_value=self.upgrade_details(target_plan),
        ):
            result = confirm_paypal_subscription_upgrade(profile, invoice.id)

        subscription.refresh_from_db()
        invoice.refresh_from_db()
        self.assertTrue(result["upgrade_scheduled"])
        self.assertEqual(subscription.plan_id, current_plan.id)
        self.assertEqual(subscription.status, "ACTIVE")
        self.assertEqual(invoice.status, "PENDING")
        self.assertIn("scheduled for the next billing cycle", invoice.result_description)

    def test_paypal_upgrade_sale_applies_target_plan_only_on_sale(self):
        profile = self.make_profile()
        current_plan = self.make_plan("Starter", "500.00", "4.00", "P-STARTER-MONTHLY")
        target_plan = self.make_plan("Growth", "1500.00", "10.00", "P-GROWTH-MONTHLY")
        subscription = self.make_subscription(profile, current_plan)
        invoice = self.make_upgrade_invoice(subscription, target_plan)
        payload = self.upgrade_sale_payload(invoice)

        with patch("apps.subscriptions.paypal_upgrade_services.publish_payment_status") as publish:
            with self.captureOnCommitCallbacks(execute=True):
                result = process_paypal_upgrade_webhook(payload)

        subscription.refresh_from_db()
        invoice.refresh_from_db()
        event = PaymentWebhookEvent.objects.get(
            provider="PAYPAL_SUBSCRIPTION", event_id="PAYPAL-UPGRADE-EVENT-1"
        )
        self.assertEqual(result["status"], "UPGRADED")
        self.assertEqual(subscription.plan_id, target_plan.id)
        self.assertEqual(subscription.billing_amount_usd, target_plan.paypal_monthly_price_usd)
        self.assertEqual(subscription.paypal_plan_id, target_plan.paypal_monthly_plan_id)
        self.assertEqual(invoice.status, "PAID")
        self.assertEqual(invoice.provider_reference, "SALE-UPGRADE-1")
        self.assertEqual(invoice.provider_transaction_id, "SALE-UPGRADE-1")
        self.assertEqual(event.status, "PROCESSED")
        publish.assert_called_once()

    def test_paypal_upgrade_sale_webhook_is_idempotent(self):
        profile = self.make_profile()
        current_plan = self.make_plan("Starter", "500.00", "4.00", "P-STARTER-MONTHLY")
        target_plan = self.make_plan("Growth", "1500.00", "10.00", "P-GROWTH-MONTHLY")
        subscription = self.make_subscription(profile, current_plan)
        invoice = self.make_upgrade_invoice(subscription, target_plan)
        payload = self.upgrade_sale_payload(invoice, sale_id="SALE-UPGRADE-IDEMPOTENT", event_id="PAYPAL-UPGRADE-IDEMPOTENT")

        with patch("apps.subscriptions.paypal_upgrade_services.publish_payment_status"):
            with self.captureOnCommitCallbacks(execute=True):
                first = process_paypal_upgrade_webhook(payload)

        with patch("apps.subscriptions.paypal_upgrade_services.publish_payment_status") as publish:
            with self.captureOnCommitCallbacks(execute=True):
                second = process_paypal_upgrade_webhook(payload)

        self.assertEqual(first["status"], "UPGRADED")
        self.assertEqual(second["status"], "ALREADY_PROCESSED")
        self.assertEqual(SubscriptionInvoice.objects.filter(landlord_subscription_id=subscription.id).count(), 1)
        self.assertEqual(
            PaymentWebhookEvent.objects.filter(
                provider="PAYPAL_SUBSCRIPTION", event_id="PAYPAL-UPGRADE-IDEMPOTENT"
            ).count(),
            1,
        )
        publish.assert_not_called()
