from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer


def publish_payment_status(*, user_id, invoice_id, status, message, provider, event_type=None, listing_id=None, subscription_id=None, subscription_status=None, details=None):
    """Publish an authoritative payment-state notification after the DB commit."""
    if not user_id or not invoice_id:
        return

    channel_layer = get_channel_layer()
    if channel_layer is None:
        return

    group_name = payment_group_name(user_id, invoice_id)
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
    async_to_sync(channel_layer.group_send)(group_name, payload)


def payment_group_name(user_id, invoice_id):
    return f"payment_{str(user_id)}_{str(invoice_id)}"
