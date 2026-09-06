from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import Profile

from .domain_bookings import Booking, MovingDispute, MoverPayout
from .domain_platform import Mover, UserNotification

DISPUTE_REASONS = {
    "DAMAGED_BELONGINGS", "MISSING_BELONGINGS", "DELIVERY_PROBLEM",
    "SERVICE_PROBLEM", "PAYMENT_PROBLEM", "OTHER",
}
RESOLUTIONS = {"RELEASE_TO_MOVER", "REFUND_RENTER", "PARTIAL_REFUND", "NO_REFUND"}


def _booking_for_participant(booking_id, user_id):
    booking = Booking.objects.select_for_update().filter(pk=booking_id).first()
    if booking is None:
        raise ValidationError("Booking not found or unauthorized")
    is_mover = Mover.objects.filter(pk=booking.mover_id, user_id=user_id).exists()
    if booking.renter_id != user_id and not is_mover:
        raise ValidationError("Booking not found or unauthorized")
    return booking


@transaction.atomic
def confirm_moving_delivery(*, user_id, booking_id):
    booking = _booking_for_participant(booking_id, user_id)
    if booking.payment_status != "paid":
        raise ValidationError("Booking must be paid before delivery confirmation")
    if booking.status not in {"in_progress", "completed"}:
        raise ValidationError("Journey must be active or completed before delivery confirmation")

    mover = Mover.objects.filter(pk=booking.mover_id).first()
    if mover is None:
        raise ValidationError("Mover not found")
    is_renter = booking.renter_id == user_id
    already_confirmed = bool(
        booking.renter_confirmed_delivery_at if is_renter else booking.mover_confirmed_delivery_at
    )
    now = timezone.now()
    if not already_confirmed:
        if is_renter:
            booking.renter_confirmed_delivery_at = now
        else:
            booking.mover_confirmed_delivery_at = now
        booking.updated_at = now
        booking.save(update_fields=[
            "renter_confirmed_delivery_at" if is_renter else "mover_confirmed_delivery_at",
            "updated_at",
        ])

    both_confirmed = bool(booking.renter_confirmed_delivery_at and booking.mover_confirmed_delivery_at)

    if both_confirmed:
        notification_data = {
            "booking_id": str(booking.id),
            "renter_confirmed_at": booking.renter_confirmed_delivery_at.isoformat(),
            "mover_confirmed_at": booking.mover_confirmed_delivery_at.isoformat(),
        }
        UserNotification.objects.get_or_create(
            event_key=f"moving-delivery-confirmed:renter:{booking.id}",
            defaults={
                "user_id": booking.renter_id,
                "notification_type": "MOVING_DELIVERY_CONFIRMED",
                "title": "Delivery confirmed",
                "message": "Both parties have confirmed delivery. Saka Krib can now process the admin escrow-release step.",
                "data": notification_data,
            },
        )
        UserNotification.objects.get_or_create(
            event_key=f"moving-delivery-confirmed:mover:{booking.id}",
            defaults={
                "user_id": mover.user_id,
                "notification_type": "MOVING_DELIVERY_CONFIRMED",
                "title": "Delivery confirmed",
                "message": "Both parties have confirmed delivery. Your payout will be completed after admin release and provider confirmation.",
                "data": notification_data,
            },
        )

    # Delivery confirmation is an audit signal for escrow release. It must not
    # mark the booking completed: completion is authoritative only after the
    # payout provider confirms the mover transfer.
    return {
        "booking_id": str(booking.id),
        "renter_confirmed": bool(booking.renter_confirmed_delivery_at),
        "mover_confirmed": bool(booking.mover_confirmed_delivery_at),
        "both_confirmed": both_confirmed,
        "status": booking.status,
        "already_confirmed": already_confirmed,
        "next_step": "ADMIN_ESCROW_RELEASE" if both_confirmed else "AWAIT_OTHER_PARTY_CONFIRMATION",
    }


@transaction.atomic
def open_moving_dispute(*, user_id, booking_id, reason_code, description):
    if reason_code not in DISPUTE_REASONS:
        raise ValidationError("Invalid dispute reason")
    description = str(description or "").strip()
    if not 1 <= len(description) <= 5000:
        raise ValidationError("Dispute description must be between 1 and 5000 characters")

    booking = _booking_for_participant(booking_id, user_id)
    if booking.status not in {"in_progress", "completed"}:
        raise ValidationError("Dispute can only be opened for an active or completed moving job")
    if booking.payment_status != "paid":
        raise ValidationError("No settled payment exists for this booking")
    if MovingDispute.objects.filter(booking_id=booking.id, status="OPEN").exists():
        raise ValidationError("An open dispute already exists for this booking")

    now = timezone.now()
    dispute = MovingDispute.objects.create(
        booking_id=booking.id,
        opened_by=user_id,
        reason_code=reason_code,
        description=description,
        status="OPEN",
    )
    booking.dispute_status = "OPEN"
    booking.updated_at = now
    booking.save(update_fields=["dispute_status", "updated_at"])
    MoverPayout.objects.filter(booking_id=booking.id, final_payment_status="processing").update(
        final_payment_status="held", updated_at=now
    )

    mover_user_id = Mover.objects.filter(pk=booking.mover_id).values_list("user_id", flat=True).first()
    if mover_user_id is None:
        raise ValidationError("Mover account not found")
    recipient_id = mover_user_id if user_id == booking.renter_id else booking.renter_id
    UserNotification.objects.create(
        user_id=recipient_id,
        notification_type="MOVING_DISPUTE_OPENED",
        title="Moving dispute opened",
        message="A dispute has been opened for this moving booking. Escrow release is paused pending admin review.",
        data={"booking_id": str(booking.id), "dispute_id": str(dispute.id)},
    )
    return {"dispute_id": str(dispute.id), "booking_id": str(booking.id), "status": "OPEN"}


@transaction.atomic
def resolve_moving_dispute(*, admin_user_id, dispute_id, resolution_code, resolution_notes=None):
    admin = Profile.objects.filter(pk=admin_user_id).first()
    if admin is None or admin.role != "admin":
        raise ValidationError("Admin access required")
    if resolution_code not in RESOLUTIONS:
        raise ValidationError("Invalid resolution")

    dispute = MovingDispute.objects.select_for_update().filter(pk=dispute_id).first()
    if dispute is None:
        raise ValidationError("Dispute not found")
    if dispute.status == "RESOLVED":
        return {
            "dispute_id": str(dispute.id), "status": "RESOLVED",
            "already_resolved": True, "resolution_code": dispute.resolution_code,
        }
    booking = Booking.objects.select_for_update().filter(pk=dispute.booking_id).first()
    if booking is None:
        raise ValidationError("Booking not found")

    notes = None if resolution_notes is None else str(resolution_notes)[:5000]
    now = timezone.now()
    dispute.status = "RESOLVED"
    dispute.resolution_code = resolution_code
    dispute.resolution_notes = notes
    dispute.resolved_by = admin_user_id
    dispute.resolved_at = now
    dispute.updated_at = now
    dispute.save(update_fields=["status", "resolution_code", "resolution_notes", "resolved_by", "resolved_at", "updated_at"])
    booking.dispute_status = "RESOLVED"
    booking.updated_at = now
    booking.save(update_fields=["dispute_status", "updated_at"])

    if resolution_code == "RELEASE_TO_MOVER" and MoverPayout.objects.filter(
        booking_id=booking.id, final_payment_status="held"
    ).exists():
        return {
            "dispute_id": str(dispute.id), "booking_id": str(booking.id),
            "status": "RESOLVED", "resolution_code": resolution_code,
            "next_step": "ADMIN_MUST_RELEASE_ESCROW",
        }

    UserNotification.objects.create(
        user_id=dispute.opened_by,
        notification_type="MOVING_DISPUTE_RESOLVED",
        title="Moving dispute resolved",
        message="An administrator has resolved your moving dispute.",
        data={"booking_id": str(booking.id), "dispute_id": str(dispute.id), "resolution_code": resolution_code},
    )
    return {
        "dispute_id": str(dispute.id), "booking_id": str(booking.id),
        "status": "RESOLVED", "resolution_code": resolution_code,
    }
