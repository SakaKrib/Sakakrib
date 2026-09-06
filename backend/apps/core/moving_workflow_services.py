from datetime import datetime, time
from zoneinfo import ZoneInfo

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from .domain_bookings import Booking, ChatMessage, MoverScheduleEvent
from .domain_platform import Mover, UserNotification
from .moving_services import (
    _ensure_no_schedule_conflict,
    _mover_schedule_window,
    request_mover_booking,
)

NAIROBI_TZ = ZoneInfo("Africa/Nairobi")


def _conversation(a, b):
    values = sorted((str(a), str(b)))
    return f"{values[0]}__{values[1]}"


def _parse_time(value):
    if value in (None, ""):
        return None
    try:
        return time.fromisoformat(str(value).strip()[:8])
    except ValueError as exc:
        raise ValidationError("Moving time must be a valid HH:MM time") from exc


@transaction.atomic
def request_mover_booking_with_schedule(*, renter_id, mover_id, pickup_address, dropoff_address,
                                         distance_km=None, pickup_latitude=None, pickup_longitude=None,
                                         dropoff_latitude=None, dropoff_longitude=None, listing_id=None,
                                         moving_date=None, moving_time=None, moving_end_time=None,
                                         preferred_payment_method=None):
    result = request_mover_booking(
        renter_id=renter_id,
        mover_id=mover_id,
        pickup_address=pickup_address,
        dropoff_address=dropoff_address,
        distance_km=distance_km,
        pickup_latitude=pickup_latitude,
        pickup_longitude=pickup_longitude,
        dropoff_latitude=dropoff_latitude,
        dropoff_longitude=dropoff_longitude,
        listing_id=listing_id,
        moving_date=moving_date,
        preferred_payment_method=preferred_payment_method,
    )

    moving_time_value = _parse_time(moving_time)
    moving_end_time_value = _parse_time(moving_end_time)
    if moving_time_value is None or moving_end_time_value is None:
        raise ValidationError("Both start time and end time are required")

    booking = Booking.objects.select_for_update().get(pk=result["booking_id"])
    start = timezone.make_aware(
        datetime.combine(booking.moving_date, moving_time_value),
        NAIROBI_TZ,
    )
    end = timezone.make_aware(
        datetime.combine(booking.moving_date, moving_end_time_value),
        NAIROBI_TZ,
    )
    if end <= start:
        raise ValidationError("End time must be after start time")
    if start <= timezone.now():
        raise ValidationError("Moving time must be in the future")

    mover = Mover.objects.select_for_update().filter(pk=booking.mover_id).first()
    if mover is None:
        raise ValidationError("Mover not found")

    _mover_schedule_window(mover, start, end)
    _ensure_no_schedule_conflict(mover.id, booking.id, start, end)

    booking.scheduled_start_at = start
    booking.scheduled_end_at = end
    booking.updated_at = timezone.now()
    booking.save(update_fields=["scheduled_start_at", "scheduled_end_at", "updated_at"])

    MoverScheduleEvent.objects.create(
        mover_id=mover.id,
        booking_id=booking.id,
        starts_at=start,
        ends_at=end,
        status="TENTATIVE",
        title="Moving service",
    )

    result["scheduled_start_at"] = start
    result["scheduled_end_at"] = end
    result["schedule_status"] = "TENTATIVE"
    return result


@transaction.atomic
def confirm_mover_booking_workflow(*, mover_user_id, booking_id):
    booking = Booking.objects.select_for_update().filter(pk=booking_id).first()
    if booking is None:
        raise ValidationError("Booking not found or unauthorized")
    mover = Mover.objects.filter(pk=booking.mover_id, user_id=mover_user_id).first()
    if mover is None:
        raise ValidationError("Booking not found or unauthorized")
    if booking.status != "pending":
        raise ValidationError("This booking is no longer awaiting a mover response")
    if booking.request_expires_at and booking.request_expires_at <= timezone.now():
        raise ValidationError("The booking response window has expired")

    now = timezone.now()
    booking.status = "confirmed"
    booking.confirmed_at = now
    booking.updated_at = now
    booking.save(update_fields=["status", "confirmed_at", "updated_at"])

    conversation = _conversation(booking.renter_id, mover.user_id)
    ChatMessage.objects.create(
        conversation_id=conversation,
        sender_id=mover.user_id,
        receiver_id=booking.renter_id,
        content="Your mover accepted the booking. Please confirm the pickup location shown below before payment.",
        message_type="booking_response",
        event_data={
            "booking_id": str(booking.id),
            "decision": "confirm",
            "status": "confirmed",
            "action_required": "location_confirmation",
            "pickup_address": booking.pickup_address,
            "dropoff_address": booking.dropoff_address,
            "pickup_latitude": booking.pickup_latitude,
            "pickup_longitude": booking.pickup_longitude,
            "dropoff_latitude": booking.dropoff_latitude,
            "dropoff_longitude": booking.dropoff_longitude,
            "moving_date": booking.moving_date.isoformat() if booking.moving_date else None,
            "scheduled_start_at": booking.scheduled_start_at.isoformat() if booking.scheduled_start_at else None,
            "scheduled_end_at": booking.scheduled_end_at.isoformat() if booking.scheduled_end_at else None,
            "schedule_status": MoverScheduleEvent.objects.filter(booking_id=booking.id).values_list("status", flat=True).first(),
            "total_amount": str(booking.total_amount),
            "payment_method": booking.payment_method,
        },
    )
    UserNotification.objects.create(
        user_id=booking.renter_id,
        notification_type="MOVER_BOOKING_CONFIRMED",
        title="Mover accepted your request",
        message="Your mover accepted the booking. Confirm your pickup location in chat, then continue to payment.",
        data={
            "booking_id": str(booking.id),
            "mover_id": str(mover.id),
            "action": "location_confirmation",
        },
    )
    return {
        "booking_id": str(booking.id),
        "decision": "confirm",
        "status": "confirmed",
        "scheduled_start_at": booking.scheduled_start_at,
        "scheduled_end_at": booking.scheduled_end_at,
    }


@transaction.atomic
def confirm_booking_location(*, renter_id, booking_id):
    booking = Booking.objects.select_for_update().filter(pk=booking_id, renter_id=renter_id).first()
    if booking is None:
        raise ValidationError("Booking not found or unauthorized")
    if booking.status != "confirmed":
        raise ValidationError("Booking must be confirmed before location confirmation")

    conversation = _conversation(booking.renter_id, booking.mover_id)
    mover = Mover.objects.filter(pk=booking.mover_id).first()
    if mover is None:
        raise ValidationError("Mover not found")
    conversation = _conversation(booking.renter_id, mover.user_id)
    ChatMessage.objects.create(
        conversation_id=conversation,
        sender_id=booking.renter_id,
        receiver_id=mover.user_id,
        content="Pickup location confirmed.",
        message_type="booking_response",
        event_data={
            "booking_id": str(booking.id),
            "decision": "confirm_location",
            "status": booking.status,
            "action_required": "payment",
        },
    )
    UserNotification.objects.create(
        user_id=mover.user_id,
        notification_type="RENTER_LOCATION_CONFIRMED",
        title="Renter confirmed the pickup location",
        message="The renter confirmed the pickup location. The booking is ready for payment.",
        data={"booking_id": str(booking.id)},
    )
    return {"booking_id": str(booking.id), "status": booking.status, "location_confirmed": True}
