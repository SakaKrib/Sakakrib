import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils.html import escape

from apps.accounts.models import Profile

from .chat_consumers import user_chat_group_name
from .domain_bookings import Booking, MovingInvoice, MovingPayment
from .domain_platform import Mover, NotificationEmail, UserNotification
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


def _queue_payment_email(*, recipient, title, message, data, audience):
    recipient = str(recipient or "").strip().lower()
    if not recipient:
        return None
    booking_id = str(data["booking_id"])
    payment_id = str(data["payment_id"])
    event_key = f"moving-payment-email:{audience}:{booking_id}:{payment_id}"
    existing = NotificationEmail.objects.filter(template_type="moving_payment_paid", html_body__contains=payment_id, recipient=recipient).first()
    if existing:
        return existing
    html = (
        '<!DOCTYPE html><html><body style="margin:0;padding:30px 15px;background:#f6f7f9;color:#222;font-family:Arial,Helvetica,sans-serif;">'
        '<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;">'
        '<div style="padding:30px;text-align:center;"><h1 style="margin:0;color:#255d3a;">Saka Krib</h1>'
        '<p style="color:#777;">Moving payment confirmation</p></div>'
        f'<div style="padding:30px;"><h2 style="color:#1b5e20;">{escape(title)}</h2>'
        f'<p style="line-height:1.7;color:#444;">{escape(message)}</p>'
        '<table width="100%" cellpadding="8" cellspacing="0" style="border-collapse:collapse;background:#f5f7f6;border-radius:10px;">'
        f'<tr><td>Booking</td><td align="right"><strong>{escape(booking_id)}</strong></td></tr>'
        f'<tr><td>Invoice</td><td align="right"><strong>{escape(str(data.get("invoice_number") or "N/A"))}</strong></td></tr>'
        f'<tr><td>Amount</td><td align="right"><strong>KES {escape(str(data.get("amount_kes") or "0.00"))}</strong></td></tr>'
        f'<tr><td>Payment status</td><td align="right"><strong>{escape(str(data.get("payment_status") or "paid"))}</strong></td></tr>'
        f'<tr><td>M-Pesa receipt</td><td align="right"><strong>{escape(str(data.get("mpesa_receipt") or "N/A"))}</strong></td></tr>'
        '</table><p style="margin-top:25px;color:#777;font-size:13px;line-height:1.6;">The payment is held securely by Saka Krib until the configured delivery and escrow-release process is completed.</p></div>'
        '<div style="padding:22px;text-align:center;background:#1e1e1e;color:#aaa;font-size:12px;">Saka Krib · support@sakakrib.com</div>'
        '</div></body></html>'
    )
    return NotificationEmail.objects.create(
        recipient=recipient,
        subject=title,
        html_body=html,
        template_type="moving_payment_paid",
        status="pending",
    )


def _publish_realtime_after_commit(*, user_ids, booking_payload, notification_payloads):
    channel_layer = get_channel_layer()
    if channel_layer is None:
        logger.warning("Moving payment realtime update skipped: channel layer is not configured")
        return

    for user_id in {str(value) for value in user_ids if value}:
        group_name = user_chat_group_name(user_id)
        async_to_sync(channel_layer.group_send)(
            group_name,
            {"type": "booking", "booking": booking_payload},
        )
        for notification in notification_payloads:
            if str(notification.get("user_id")) != user_id:
                continue
            async_to_sync(channel_layer.group_send)(
                group_name,
                {"type": "notification", "notification": notification},
            )


@transaction.atomic
def finalize_successful_moving_mpesa_payment(
    *, checkout_request_id, result_code, result_description, callback_metadata=None, merchant_request_id=None
):
    """Run the successful moving STK flow as one database transaction."""
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

    # Non-zero callbacks stop here. No successful notification, email,
    # financial-document, or realtime work is executed.
    if normalized_result_code != 0:
        return result

    # Duplicate successful callbacks must not enqueue another success flow.
    if result.get("status") != "HELD":
        return result

    payment = MovingPayment.objects.select_for_update().get(pk=result["payment_id"])
    booking = Booking.objects.select_for_update().get(pk=payment.booking_id)
    invoice = MovingInvoice.objects.select_for_update().filter(pk=payment.invoice_id).first()
    if invoice is None:
        raise ValidationError("Moving invoice not found")
    mover = Mover.objects.filter(pk=booking.mover_id).first()
    if mover is None:
        raise ValidationError("Mover not found")

    # This remains inside the outer transaction. Any exception rolls back the
    # existing payment settlement plus every operation below.
    documents = ensure_moving_financial_documents(payment_id=str(payment.id))

    notification_data = {
        "booking_id": str(booking.id),
        "payment_id": str(payment.id),
        "invoice_id": str(invoice.id),
        "invoice_number": invoice.invoice_number,
        "payment_status": booking.payment_status,
        "payment_method": booking.payment_method,
        "amount_kes": str(payment.amount_kes),
        "mpesa_receipt": payment.mpesa_receipt,
        "provider_transaction_id": payment.provider_transaction_id,
        "result_code": 0,
    }

    # _settle_payment already creates the renter and mover in-app notifications.
    # Reuse those rows rather than creating duplicate notifications.
    existing_notifications = list(
        UserNotification.objects.filter(
            user_id__in=[booking.renter_id, mover.user_id],
            notification_type="MOVING_PAYMENT_PAID",
            data__booking_id=str(booking.id),
        ).order_by("created_at")
    )
    notification_payloads = [
        {
            "id": str(notification.id),
            "user_id": str(notification.user_id),
            "notification_type": notification.notification_type,
            "title": notification.title,
            "message": notification.message,
            "data": notification.data,
        }
        for notification in existing_notifications
    ]

    # Queue the payment emails inside the same transaction. Actual SMTP delivery
    # is performed later by the existing email worker/process.
    renter_email = Profile.objects.filter(pk=booking.renter_id).values_list("email", flat=True).first() or ""
    mover_email = Profile.objects.filter(pk=mover.user_id).values_list("email", flat=True).first() or ""
    _queue_payment_email(
        recipient=renter_email,
        title="Moving payment received - Saka Krib",
        message="Your moving payment was received successfully and is being held securely until delivery is confirmed.",
        data=notification_data,
        audience="renter",
    )
    _queue_payment_email(
        recipient=mover_email,
        title="Renter paid for the move - Saka Krib",
        message="The renter has paid successfully. The funds are being held and will be released after the configured delivery and escrow process.",
        data=notification_data,
        audience="mover",
    )

    # Administration uses the existing notification/email queue.
    admin_ids = list(Profile.objects.filter(role="admin", is_active=True).values_list("pk", flat=True))
    for admin_id in admin_ids:
        title = "Moving payment received"
        message = f"A renter successfully paid KES {payment.amount_kes:,.2f} for moving booking {booking.id}. The funds are held pending delivery confirmation."
        queued = dispatch_user_notification(
            user_id=admin_id,
            notification_type="MOVING_PAYMENT_PAID_ADMIN",
            title=title,
            message=message,
            data=notification_data,
            event_key=f"moving-payment-paid:admin:{booking.id}:{admin_id}",
            send_email=True,
            email_template="moving_payment_paid",
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
    user_ids = [booking.renter_id, mover.user_id, *admin_ids]

    # WebSocket delivery happens only after COMMIT. If any DB operation above
    # fails, this callback is discarded and no success event is published.
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
