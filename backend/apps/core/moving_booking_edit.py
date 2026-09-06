from datetime import datetime
from zoneinfo import ZoneInfo

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from .domain_bookings import Booking, ChatMessage, MoverScheduleEvent
from .domain_platform import Mover, UserNotification
from .moving_services import _mover_schedule_window, _ensure_no_schedule_conflict, _money, _schedule_datetime, calculate_mover_quote

NAIROBI_TZ = ZoneInfo("Africa/Nairobi")


def _conversation(a, b):
    values = sorted((str(a), str(b)))
    return f"{values[0]}__{values[1]}"


def _parse_time(value):
    if value in (None, ""):
        return None
    try:
        return datetime.strptime(str(value).strip()[:5], "%H:%M").time()
    except ValueError as exc:
        raise ValidationError("Moving time must be a valid HH:MM time") from exc


@transaction.atomic
def edit_moving_booking(*, renter_id, booking_id, pickup_address=None, dropoff_address=None,
                        pickup_latitude=None, pickup_longitude=None, dropoff_latitude=None,
                        dropoff_longitude=None, distance_km=None, moving_date=None,
                        moving_time=None, moving_end_time=None, payment_method=None):
    booking = Booking.objects.select_for_update().filter(pk=booking_id, renter_id=renter_id).first()
    if booking is None:
        raise ValidationError("Booking not found or unauthorized")
    if booking.status != "confirmed":
        raise ValidationError("Only a confirmed moving booking can be edited")
    if str(booking.payment_status or "").lower() not in {"", "unpaid", "pending"}:
        raise ValidationError("This booking can no longer be edited after payment has started")

    mover = Mover.objects.filter(pk=booking.mover_id).first()
    if mover is None:
        raise ValidationError("Mover not found")

    changed = []
    if pickup_address is not None and str(pickup_address).strip():
        booking.pickup_address = str(pickup_address).strip()
        changed.append("pickup")
    if dropoff_address is not None and str(dropoff_address).strip():
        booking.dropoff_address = str(dropoff_address).strip()
        changed.append("dropoff")

    coordinate_fields = {
        "pickup_latitude": pickup_latitude,
        "pickup_longitude": pickup_longitude,
        "dropoff_latitude": dropoff_latitude,
        "dropoff_longitude": dropoff_longitude,
    }
    for field, value in coordinate_fields.items():
        if value is not None:
            setattr(booking, field, value)
            changed.append("location")

    if payment_method is not None and str(payment_method).strip():
        booking.payment_method = str(payment_method).strip()
        changed.append("payment_method")

    if distance_km is not None:
        quote = calculate_mover_quote(mover_id=mover.id, distance_km=distance_km)
        booking.distance_km = quote["distance_km"]
        booking.base_rate_kes = quote["base_rate_kes"]
        booking.rate_per_km_kes = quote["rate_per_km_kes"]
        booking.total_amount = _money(quote["renter_total_kes"])
        booking.commission_amount = _money(quote["platform_fee_kes"])
        booking.booking_amount = _money(quote["mover_net_kes"])
        changed.append("quote")

    starts = booking.scheduled_start_at
    ends = booking.scheduled_end_at
    if moving_date is not None or moving_time is not None or moving_end_time is not None:
        date_value = moving_date or (booking.moving_date.isoformat() if booking.moving_date else None)
        if not date_value:
            raise ValidationError("A moving date is required")
        start_time = _parse_time(moving_time) if moving_time is not None else (starts.astimezone(NAIROBI_TZ).time() if starts else None)
        end_time = _parse_time(moving_end_time) if moving_end_time is not None else (ends.astimezone(NAIROBI_TZ).time() if ends else None)
        if start_time is None or end_time is None:
            raise ValidationError("Both moving start and end times are required when editing the schedule")
        try:
            starts = timezone.make_aware(datetime.combine(datetime.fromisoformat(str(date_value)).date(), start_time), NAIROBI_TZ)
            ends = timezone.make_aware(datetime.combine(datetime.fromisoformat(str(date_value)).date(), end_time), NAIROBI_TZ)
        except ValueError as exc:
            raise ValidationError("Moving date must be a valid YYYY-MM-DD date") from exc
        if ends <= starts:
            raise ValidationError("End time must be after start time")
        if starts <= timezone.now():
            raise ValidationError("Moving time must be in the future")
        _mover_schedule_window(mover, starts, ends)
        _ensure_no_schedule_conflict(mover.id, booking.id, starts, ends, confirmed_only=True)
        booking.moving_date = starts.astimezone(NAIROBI_TZ).date()
        changed.append("schedule")

        event = MoverScheduleEvent.objects.select_for_update().filter(booking_id=booking.id).first()
        if event is None:
            event = MoverScheduleEvent.objects.create(
                mover_id=mover.id, booking_id=booking.id, starts_at=starts, ends_at=ends,
                status="CONFIRMED", title="Moving service",
            )
        else:
            event.starts_at = starts
            event.ends_at = ends
            event.status = "CONFIRMED"
            event.title = "Moving service"
            event.save(update_fields=["starts_at", "ends_at", "status", "title", "updated_at"])
        booking.scheduled_start_at = starts
        booking.scheduled_end_at = ends

    now = timezone.now()
    booking.updated_at = now
    booking.save()

    if not changed:
        raise ValidationError("No booking changes were supplied")

    conversation = _conversation(booking.renter_id, mover.user_id)
    ChatMessage.objects.create(
        conversation_id=conversation,
        sender_id=booking.renter_id,
        receiver_id=mover.user_id,
        content="The renter updated the moving booking details. Please review the updated details in chat.",
        message_type="booking_response",
        event_data={
            "booking_id": str(booking.id),
            "decision": "booking_edited",
            "status": booking.status,
            "action_required": "review_edit",
            "changed": changed,
            "pickup_address": booking.pickup_address,
            "dropoff_address": booking.dropoff_address,
            "moving_date": booking.moving_date.isoformat() if booking.moving_date else None,
            "scheduled_start_at": booking.scheduled_start_at.isoformat() if booking.scheduled_start_at else None,
            "scheduled_end_at": booking.scheduled_end_at.isoformat() if booking.scheduled_end_at else None,
            "total_amount": str(booking.total_amount),
            "payment_method": booking.payment_method,
        },
    )
    UserNotification.objects.create(
        user_id=mover.user_id,
        notification_type="MOVING_BOOKING_EDITED",
        title="Moving booking updated",
        message="The renter updated the details of a confirmed moving booking. Review the updated route and schedule in chat.",
        data={"booking_id": str(booking.id), "changed": changed},
    )
    return {
        "id": str(booking.id),
        "pickup_address": booking.pickup_address,
        "dropoff_address": booking.dropoff_address,
        "moving_date": booking.moving_date,
        "booking_amount": booking.booking_amount,
        "total_amount": booking.total_amount,
        "status": booking.status,
        "payment_status": booking.payment_status,
        "payment_method": booking.payment_method,
        "request_expires_at": booking.request_expires_at,
        "confirmed_at": booking.confirmed_at,
        "scheduled_start_at": booking.scheduled_start_at,
        "scheduled_end_at": booking.scheduled_end_at,
        "changed": changed,
    }
