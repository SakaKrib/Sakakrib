import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

logger = logging.getLogger(__name__)


def publish_payment_status(*, user_id, invoice_id, status, message, provider, event_type=None, listing_id=None, subscription_id=None, subscription_status=None, details=None):
    """Publish an authoritative payment-state notification after the DB commit."""
    if not user_id or not invoice_id:
        return

    channel_layer = get_channel_layer()
    payload = {
        "type": "payment.status",
        "status": status,
        "message": message,
        "provider": provider,
        "invoice_id": str(invoice_id),
        "event_type": event_type,
        "listing_id": str(listing_id) if listing_id else None,
        "subscription_id": str(subscription_id) if subscription_id else None,
        "subscription_status": subscription_status,
        "details": details or {},
    }

    if channel_layer is not None:
        group_name = payment_group_name(user_id, invoice_id)
        async_to_sync(channel_layer.group_send)(group_name, payload)
        async_to_sync(channel_layer.group_send)(
            subscription_invoice_group_name(user_id),
            {
                "type": "subscription.invoice",
                "event_type": event_type or "invoice_updated",
                "status": status,
                "invoice_id": str(invoice_id),
                "listing_id": str(listing_id) if listing_id else None,
                "subscription_id": str(subscription_id) if subscription_id else None,
            },
        )

    if subscription_id:
        try:
            from .notification_services import dispatch_user_notification
            from apps.subscriptions.models import (
                LandlordSubscription,
                RealEstateSubscription,
                SubscriptionInvoice,
                SubscriptionPlan,
            )

            normalized_status = str(status or "PAYMENT").upper()
            detail_data = dict(details or {})
            is_upgrade = bool(detail_data.get("upgrade"))
            is_renewal = bool(detail_data.get("renewal"))

            invoice = SubscriptionInvoice.objects.filter(pk=invoice_id).first()
            subscription = None
            if invoice:
                if invoice.landlord_subscription_id:
                    subscription = LandlordSubscription.objects.filter(pk=invoice.landlord_subscription_id).first()
                elif invoice.real_estate_subscription_id:
                    subscription = RealEstateSubscription.objects.filter(pk=invoice.real_estate_subscription_id).first()

            plan = None
            if invoice and invoice.upgrade_plan_id:
                plan = SubscriptionPlan.objects.filter(pk=invoice.upgrade_plan_id).first()
            elif subscription:
                plan = SubscriptionPlan.objects.filter(pk=subscription.plan_id).first()

            if invoice:
                billing_cycle = invoice.upgrade_billing_cycle or (subscription.billing_cycle if subscription else None)
                detail_data.update({
                    "plan_name": plan.name if plan else detail_data.get("plan_name"),
                    "billing_cycle": billing_cycle or detail_data.get("billing_cycle"),
                    "amount_kes": invoice.amount_kes,
                    "amount_usd": invoice.amount_usd,
                    "provider": invoice.payment_provider or provider,
                    "provider_reference": invoice.provider_reference,
                    "provider_transaction_id": invoice.provider_transaction_id,
                    "payment_method": invoice.payment_method,
                    "billing_period_start": invoice.billing_period_start,
                    "billing_period_end": invoice.billing_period_end,
                })

            if normalized_status == "PAID" and not is_upgrade and not is_renewal:
                is_renewal = bool(invoice and invoice.pricing_snapshot_source == "subscription_billing_amount")
                if is_renewal:
                    detail_data["renewal"] = True

            if is_upgrade:
                title = "Subscription upgraded"
                notification_type = "SUBSCRIPTION_UPGRADED"
                email_template = "subscription_upgraded"
            elif is_renewal and normalized_status == "PAID":
                title = "Subscription renewal confirmed"
                notification_type = "SUBSCRIPTION_RENEWAL_CONFIRMED"
                email_template = "subscription_payment_confirmed"
            elif normalized_status == "PAID":
                title = "Subscription payment confirmed"
                notification_type = "SUBSCRIPTION_PAYMENT_CONFIRMED"
                email_template = "subscription_payment_confirmed"
            elif normalized_status == "FAILED":
                title = "Subscription payment failed"
                notification_type = "SUBSCRIPTION_PAYMENT_FAILED"
                email_template = "subscription_payment_failed"
            else:
                title = "Subscription payment update"
                notification_type = "SUBSCRIPTION_PAYMENT_UPDATE"
                email_template = "subscription_payment_confirmed"

            event_key = f"subscription-payment:{subscription_id}:{invoice_id}:{normalized_status}"
            if is_renewal and normalized_status == "PAID":
                event_key = f"subscription-renewal:{subscription_id}:{invoice_id}:PAID"

            notification_data = {
                "invoice_id": str(invoice_id),
                "subscription_id": str(subscription_id),
                "subscription_status": subscription_status,
                "provider": provider,
                "event_type": event_type,
                "status": normalized_status,
                "message": message,
                **detail_data,
                "details": detail_data,
            }
            dispatch_user_notification(
                user_id=user_id,
                notification_type=notification_type,
                title=title,
                message=message,
                data=notification_data,
                event_key=event_key,
                send_email=True,
                email_template=email_template,
            )
        except Exception:
            logger.exception(
                "Unable to queue subscription payment notification",
                extra={
                    "user_id": str(user_id),
                    "invoice_id": str(invoice_id),
                    "subscription_id": str(subscription_id),
                    "status": str(status),
                },
            )


def publish_subscription_invoice_event(*, user_id, invoice_id, event_type="invoice_created", status="PENDING", listing_id=None, subscription_id=None):
    """Notify the authenticated user's invoice-history view after an invoice is committed."""
    if not user_id or not invoice_id:
        return

    channel_layer = get_channel_layer()
    if channel_layer is None:
        return

    async_to_sync(channel_layer.group_send)(
        subscription_invoice_group_name(user_id),
        {
            "type": "subscription.invoice",
            "event_type": event_type,
            "status": status,
            "invoice_id": str(invoice_id),
            "listing_id": str(listing_id) if listing_id else None,
            "subscription_id": str(subscription_id) if subscription_id else None,
        },
    )


def payment_group_name(user_id, invoice_id):
    return f"payment_{str(user_id)}_{str(invoice_id)}"


def subscription_invoice_group_name(user_id):
    return f"subscription_invoices_{str(user_id)}"
