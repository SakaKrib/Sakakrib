import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

logger = logging.getLogger(__name__)


def publish_payment_status(*, user_id, invoice_id, status, message, provider, event_type=None, listing_id=None, subscription_id=None, subscription_status=None, details=None):
    """Publish an authoritative payment-state notification after the DB commit.

    Subscription payment events also enter the existing persistent notification
    and email queue. The payment WebSocket remains the real-time channel, while
    the persistent notification/email is the durable user-facing record.
    """
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

    if subscription_id:
        try:
            from .notification_services import dispatch_user_notification

            normalized_status = str(status or "PAYMENT").upper()
            detail_data = details or {}
            is_upgrade = bool(detail_data.get("upgrade"))
            if is_upgrade:
                title = "Subscription upgraded"
                notification_type = "SUBSCRIPTION_UPGRADED"
                email_template = "subscription_upgraded"
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
            # A notification/email failure must never turn a provider-confirmed
            # payment settlement into a failed payment response.
            logger.exception(
                "Unable to queue subscription payment notification",
                extra={
                    "user_id": str(user_id),
                    "invoice_id": str(invoice_id),
                    "subscription_id": str(subscription_id),
                    "status": str(status),
                },
            )


def payment_group_name(user_id, invoice_id):
    return f"payment_{str(user_id)}_{str(invoice_id)}"
