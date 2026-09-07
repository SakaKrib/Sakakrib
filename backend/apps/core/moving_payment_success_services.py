import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import transaction

from apps.accounts.models import Profile

from .chat_consumers import user_chat_group_name
from .domain_bookings import Booking, MovingPayment
from .domain_platform import Mover
from .moving_financial_services import ensure_moving_financial_documents
from .moving_payment_services import finalize_moving_mpesa_callback
from .notification_services import dispatch_user_notification

logger = logging.getLogger(__name__)


def _booking_realtime_payload(booking):
    return {
        "id": str(booking.id),
        "booking_id": str(booking.id),
        "status": booking.status,
        "payment_status": booking.payment_status,
        "payment_method": booking.payment_method,
        "started_at": booking.started_at.isoformat() if booking.started_at else None,
        "tracking_number": booking.tracking_number,
        "scheduled_start_at": booking.scheduled_start_at.isoformat() if booking.scheduled_start_at else None,
        "updated_at": booking.updated_at.isoformat() if booking.updated_at else None,
    }


def _publish_realtime_after_commit(*, user_ids, booking_payload, notification_payloads):
    channel_layer = get_channel_layer()
    if channel_layer is None:
        logger.warning("Moving payment realtime update skipped: channel layer is not configured")
        return

    for user_id in {str(value) for value in user_ids if value}:
        group_name = user_chat_group_name(user_id)
        async_to_sync(channel_layer.group_send)(
            group_name,
            {
                "type": "booking",
                "booking": booking_payload,
            },
        )
        for notification in notification_payloads:
            if str(notification.get("user_id")) != user_id:
                continue
            async_to_sync(channel_layer.group_send)(
                group_name,
                {
                    "type": "notification",
                    "notification": notification,
                },
            )


@transaction.atomic
def finalize_successful_moving_mpesa_payment(
    *, checkout_request_id, result_code, result_description, callback_metadata=None, merchant_request_id=None
):
    """Process a moving STK callback without allowing partial success.

    ResultCode is the hard success gate. Failed callbacks only update the payment
    attempt to FAILED. A successful callback performs the existing settlement,
    financial-document creation, notification/email queueing, and realtime
    publication scheduling inside one database transaction. External realtime
    delivery is deferred until after commit because it cannot participate in the
    PostgreSQL transaction itself.
    """
    try:
        normalized_result_code = int(result_code)
    except (TypeError, ValueError):
        normalized_result_code = 1

    result = finalize_moving_mpesa_callback(
        checkout_request_id=checkout_request_id,
        result_code=normalized_result_code,
        result_description=result_description,
        callback_metadata=callback_metadata,
        merchant_request_id=merchant_request_id,
    )

    if normalized_result_code != 0:
        return result

    if result.get("status") != "HELD":
        return result

    payment = MovingPayment.objects.select_for_update().select_related().get(pk=result["payment_id"])
    booking = Booking.objects.select_for_update().get(pk=payment.booking_id)
    mover = Mover.objects.filter(pk=booking.mover_id).first()
    if mover is None:
        raise ValidationError("Mover not found")

    # Financial documents are deliberately inside this outer transaction. If
    # document creation fails, payment/invoice/booking/payout/notifications all
    # roll back together.
    documents = ensure_moving_financial_documents(payment_id=str(payment.id))

    notification_data = {
        "booking_id": str(booking.id),
        "payment_id": str(payment.id),
        "invoice_id": str(payment.invoice_id),
        "invoice_number": getattr(payment.invoice, "invoice_number", "") if hasattr(payment, "invoice") else "",
        "payment_status": booking.payment_status,
        "payment_method": booking.payment_method,
        "amount_kes": str(payment.amount_kes),
        "mpesa_receipt": payment.mpesa_receipt,
        "provider_transaction_id": payment.provider_transaction_id,
        "result_code": 0,
    }

    notification_payloads = []
    recipients = [
        (
            booking.renter_id,
            "MOVING_PAYMENT_PAID",
            "Moving payment received",
            "Your moving payment was received and is being held securely until delivery is confirmed.",
            f"moving-payment-paid:renter:{booking.id}",
        ),
        (
            mover.user_id,
            "MOVING_PAYMENT_PAID",
            "Renter paid for the move",
            "The renter has paid. The funds will be released after safe delivery is confirmed.",
            f"moving-payment-paid:mover:{booking.id}",
        ),
    ]

    for user_id, notification_type, title, message, event_key in recipients:
        queued = dispatch_user_notification(
            user_id=user_id,
            notification_type=notification_type,
            title=title,
            message=message,
            data=notification_data,
            event_key=event_key,
            send_email=True,
            email_template="generic",
        )
        notification_payloads.append(
            {
                "id": queued.get("notification_id"),
                "user_id": str(user_id),
                "notification_type": notification_type,
                "title": title,
                "message": message,
                "data": notification_data,
            }
        )

    # Administration is notified through the same notification/email queue.
    # No separate notification architecture is introduced.
    for admin_id in Profile.objects.filter(role="admin", is_active=True).values_list("pk", flat=True):
        title = "Moving payment received"
        message = f"A renter successfully paid KES {payment.amount_kes:,.2f} for moving booking {booking.id}. The funds are held pending delivery confirmation."
        event_key = f"moving-payment-paid:admin:{booking.id}:{admin_id}"
        queued = dispatch_user_notification(
            user_id=admin_id,
            notification_type="MOVING_PAYMENT_PAID_ADMIN",
            title=title,
            message=message,
            data=notification_data,
            event_key=event_key,
            send_email=True,
            email_template="generic",
        )
        notification_payloads.append(
            {
                "id": queued.get("notification_id"),
                "user_id": str(admin_id),
                "notification_type": "MOVING_PAYMENT_PAID_ADMIN",
                "title": title,
                "message": message,
                "data": notification_data,
            }
        )

    booking_payload = _booking_realtime_payload(booking)
    user_ids = [booking.renter_id, mover.user_id]
    user_ids.extend(Profile.objects.filter(role="admin", is_active=True).values_list("pk", flat=True))

    # WebSocket delivery starts only after the transaction commits. If any DB
    # operation above raises, on_commit is never called and no realtime event is
    # published for the rolled-back payment.
    transaction.on_commit(
        lambda: _publish_realtime_after_commit(
            user_ids=user_ids,
            booking_payload=booking_payload,
            notification_payloads=notification_payloads,
        )
    )

    return {
        **result,
        "result_code": 0,
        "financial_documents": documents,
        "notifications_queued": len(notification_payloads),
        "realtime_queued": True,
    }
