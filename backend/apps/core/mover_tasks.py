from celery import shared_task
from django.db import transaction
from django.utils import timezone

from .domain_bookings import Booking, ChatMessage, MovingCancellationEvent
from .domain_platform import Mover
from .notification_services import dispatch_user_notification


@shared_task(bind=True, autoretry_for=(Exception,), retry_backoff=True, retry_kwargs={"max_retries": 3})
def expire_unresponded_mover_booking_requests(self, batch_size: int = 200):
    """Cancel pending mover requests after their 30-minute response window."""
    now = timezone.now()
    expired_ids = list(
        Booking.objects.filter(
            status="pending",
            request_expires_at__isnull=False,
            request_expires_at__lte=now,
        )
        .order_by("request_expires_at", "created_at")
        .values_list("id", flat=True)[:batch_size]
    )

    processed = cancelled = skipped = failed = 0

    for booking_id in expired_ids:
        processed += 1
        try:
            with transaction.atomic():
                booking = Booking.objects.select_for_update().filter(
                    pk=booking_id,
                    status="pending",
                    request_expires_at__isnull=False,
                    request_expires_at__lte=now,
                ).first()
                if booking is None:
                    skipped += 1
                    continue

                mover = Mover.objects.filter(pk=booking.mover_id).first()
                booking.status = "cancelled"
                booking.cancelled_at = now
                booking.cancellation_reason = "MOVER_DID_NOT_CONFIRM"
                booking.cancellation_details = "The mover request expired before the mover responded."
                booking.updated_at = now
                booking.save(update_fields=[
                    "status", "cancelled_at", "cancellation_reason",
                    "cancellation_details", "updated_at",
                ])

                if mover is not None:
                    MovingCancellationEvent.objects.create(
                        booking_id=booking.id,
                        cancelled_by=mover.user_id,
                        reason_code="MOVER_DID_NOT_CONFIRM",
                        reason_text="Mover did not respond within the 30-minute request window.",
                    )

                    conversation_id = "__".join(sorted((str(booking.renter_id), str(mover.user_id))))
                    ChatMessage.objects.create(
                        conversation_id=conversation_id,
                        sender_id=mover.user_id,
                        receiver_id=booking.renter_id,
                        content="The moving request expired because the mover did not respond within 30 minutes.",
                        message_type="system",
                        event_data={
                            "booking_id": str(booking.id),
                            "reason_code": "MOVER_DID_NOT_CONFIRM",
                            "request_expires_at": booking.request_expires_at.isoformat(),
                        },
                    )

                    dispatch_user_notification(
                        user_id=mover.user_id,
                        notification_type="MOVER_REQUEST_EXPIRED",
                        title="Moving request expired",
                        message="A moving request expired because it was not answered within 30 minutes.",
                        data={
                            "booking_id": str(booking.id),
                            "mover_id": str(booking.mover_id),
                            "request_expires_at": booking.request_expires_at.isoformat(),
                        },
                        event_key=f"mover_request_expired_mover:{booking.id}",
                        send_email=False,
                    )

                dispatch_user_notification(
                    user_id=booking.renter_id,
                    notification_type="MOVER_REQUEST_EXPIRED",
                    title="Moving request expired",
                    message="Your moving request expired because the mover did not respond within 30 minutes.",
                    data={
                        "booking_id": str(booking.id),
                        "mover_id": str(booking.mover_id),
                        "request_expires_at": booking.request_expires_at.isoformat(),
                    },
                    event_key=f"mover_request_expired:{booking.id}",
                    send_email=False,
                )
                cancelled += 1
        except Exception:
            failed += 1

    return {
        "success": True,
        "processed": processed,
        "cancelled": cancelled,
        "skipped": skipped,
        "failed": failed,
        "processed_at": timezone.now().isoformat(),
    }
