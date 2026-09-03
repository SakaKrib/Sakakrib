from datetime import date
from decimal import Decimal, ROUND_HALF_UP
import math
import uuid
from zoneinfo import ZoneInfo

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import Profile

from .domain_bookings import Booking, ChatMessage, MovingCancellationEvent, MovingInvoice, MoverScheduleEvent
from .domain_platform import Mover, NotificationEmail, UserNotification
from .domain_property import PlatformSettings

TWOPLACES = Decimal("0.01")
EARTH_RADIUS_KM = 6371.0088
NAIROBI_TZ = ZoneInfo("Africa/Nairobi")


def _money(value):
    return Decimal(value or 0).quantize(TWOPLACES, rounding=ROUND_HALF_UP)


def _profile(user_id):
    try:
        return Profile.objects.get(pk=user_id)
    except Profile.DoesNotExist as exc:
        raise ValidationError("Profile not found") from exc


def _conversation(a, b):
    values = sorted((str(a), str(b)))
    return f"{values[0]}__{values[1]}"


def _platform_settings():
    settings_row = PlatformSettings.objects.filter(pk=True).first()
    if settings_row is None:
        raise ValidationError("Platform settings are not configured")
    return settings_row


def calculate_mover_distance(*, pickup_latitude, pickup_longitude, dropoff_latitude, dropoff_longitude):
    coordinates = [
        (pickup_latitude, "pickup latitude", -90, 90),
        (dropoff_latitude, "dropoff latitude", -90, 90),
        (pickup_longitude, "pickup longitude", -180, 180),
        (dropoff_longitude, "dropoff longitude", -180, 180),
    ]
    for value, name, low, high in coordinates:
        if value is None or not low <= float(value) <= high:
            raise ValidationError(f"Invalid {name}")

    lat1 = math.radians(float(pickup_latitude))
    lon1 = math.radians(float(pickup_longitude))
    lat2 = math.radians(float(dropoff_latitude))
    lon2 = math.radians(float(dropoff_longitude))
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    haversine = (
        math.sin(dlat / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    )
    haversine = min(1.0, max(0.0, haversine))
    return Decimal(str(round(EARTH_RADIUS_KM * 2 * math.asin(math.sqrt(haversine)), 2)))


def calculate_mover_quote(*, mover_id, distance_km):
    distance = Decimal(str(distance_km))
    if distance < 0:
        raise ValidationError("Distance must be zero or greater")
    mover = Mover.objects.filter(pk=mover_id, approval_status="approved", is_available=True).first()
    if mover is None:
        raise ValidationError("Mover is not approved, unavailable, or does not exist")
    platform = _platform_settings()
    base = _money(mover.base_rate_kes)
    rate = _money(mover.rate_per_km_kes)
    mover_charge = _money(base + rate * distance)
    markup = _money(mover_charge * platform.mover_operational_markup_rate)
    total = _money(mover_charge + markup)
    fee = _money(mover_charge * platform.mover_commission_rate)
    return {
        "mover_id": str(mover.id),
        "distance_km": round(float(distance), 2),
        "base_rate_kes": base,
        "rate_per_km_kes": rate,
        "renter_total_kes": total,
        "platform_fee_kes": fee,
        "platform_commission_rate": platform.mover_commission_rate,
        "mover_net_kes": _money(total - fee),
    }


def _invoice_number():
    return f"SK-MOV-{timezone.now():%Y%m%d}-{uuid.uuid4().hex[:8].upper()}"


def _ensure_moving_invoice(booking, mover):
    invoice = MovingInvoice.objects.filter(booking_id=booking.id).first()
    if invoice is not None:
        if _money(invoice.amount_kes) != _money(booking.total_amount):
            raise ValidationError("Existing moving invoice does not match booking total")
        return invoice
    return MovingInvoice.objects.create(
        booking_id=booking.id,
        invoice_number=_invoice_number(),
        renter_id=booking.renter_id,
        mover_id=booking.mover_id,
        amount_kes=_money(booking.total_amount),
        platform_fee_kes=_money(booking.commission_amount),
        mover_net_kes=_money(booking.total_amount - booking.commission_amount),
        currency="KES",
        status="ISSUED",
        mover_name_snapshot=mover.driver_full_name or "",
        mover_phone_snapshot=mover.phone,
        vehicle_type_snapshot=mover.vehicle_type,
        number_plate_snapshot=mover.number_plate,
        mover_profile_photo_snapshot=mover.profile_photo_url,
    )


def _schedule_datetime(value):
    try:
        parsed = timezone.datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError) as exc:
        raise ValidationError("Schedule times must be valid ISO datetimes") from exc
    if parsed.tzinfo is None:
        parsed = timezone.make_aware(parsed, NAIROBI_TZ)
    return parsed


def _mover_schedule_window(mover, starts_at, ends_at):
    local_start = starts_at.astimezone(NAIROBI_TZ)
    local_end = ends_at.astimezone(NAIROBI_TZ)
    if local_start.date() != local_end.date():
        raise ValidationError("Moving schedule must start and end on the same Nairobi calendar day")
    if mover.working_days:
        weekday = local_start.strftime("%A").lower()
        allowed = {str(day).strip().lower() for day in mover.working_days}
        if weekday not in allowed:
            raise ValidationError(f"Mover does not work on {weekday}")
    if mover.start_time is not None and local_start.time() < mover.start_time:
        raise ValidationError("Start time is outside mover working hours")
    if mover.end_time is not None and local_end.time() > mover.end_time:
        raise ValidationError("End time is outside mover working hours")


def _ensure_no_schedule_conflict(mover_id, booking_id, starts_at, ends_at, *, confirmed_only=False):
    statuses = ["CONFIRMED"] if confirmed_only else ["TENTATIVE", "CONFIRMED"]
    if MoverScheduleEvent.objects.filter(
        mover_id=mover_id,
        status__in=statuses,
        starts_at__lt=ends_at,
        ends_at__gt=starts_at,
    ).exclude(booking_id=booking_id).exists():
        raise ValidationError("Mover already has another scheduled job at that time")


@transaction.atomic
def propose_moving_schedule(*, renter_id, booking_id, starts_at, ends_at):
    starts = _schedule_datetime(starts_at)
    ends = _schedule_datetime(ends_at)
    now = timezone.now()
    if ends <= starts:
        raise ValidationError("End time must be after start time")
    if starts <= now:
        raise ValidationError("Moving time must be in the future")

    booking = Booking.objects.select_for_update().filter(pk=booking_id, renter_id=renter_id).first()
    if booking is None:
        raise ValidationError("Booking not found or unauthorized")
    if booking.status != "confirmed":
        raise ValidationError("Mover must confirm before scheduling")
    if booking.scheduled_start_at is not None or booking.scheduled_end_at is not None:
        raise ValidationError("A moving schedule is already confirmed")

    mover = Mover.objects.select_for_update().filter(pk=booking.mover_id).first()
    if mover is None:
        raise ValidationError("Mover not found")
    _mover_schedule_window(mover, starts, ends)
    _ensure_no_schedule_conflict(mover.id, booking.id, starts, ends)

    event = MoverScheduleEvent.objects.filter(booking_id=booking.id).first()
    if event is None:
        event = MoverScheduleEvent.objects.create(
            mover_id=mover.id,
            booking_id=booking.id,
            starts_at=starts,
            ends_at=ends,
            status="TENTATIVE",
            title="Moving service",
        )
    else:
        event.starts_at = starts
        event.ends_at = ends
        event.status = "TENTATIVE"
        event.title = "Moving service"
        event.save(update_fields=["starts_at", "ends_at", "status", "title", "updated_at"])

    return {
        "booking_id": str(booking.id),
        "schedule_id": str(event.id),
        "starts_at": event.starts_at,
        "ends_at": event.ends_at,
        "status": event.status,
    }


@transaction.atomic
def confirm_moving_schedule(*, mover_user_id, booking_id):
    booking = Booking.objects.select_for_update().filter(pk=booking_id).first()
    if booking is None:
        raise ValidationError("Booking not found or unauthorized")
    mover = Mover.objects.filter(pk=booking.mover_id, user_id=mover_user_id).first()
    if mover is None:
        raise ValidationError("Booking not found or unauthorized")
    if booking.status != "confirmed":
        raise ValidationError("Booking must be confirmed before scheduling")
    event = MoverScheduleEvent.objects.filter(booking_id=booking.id).first()
    if event is None:
        raise ValidationError("No schedule proposal exists")
    if event.status == "CONFIRMED":
        return {"booking_id": str(booking.id), "schedule_id": str(event.id), "status": event.status, "starts_at": event.starts_at, "ends_at": event.ends_at}
    _mover_schedule_window(mover, event.starts_at, event.ends_at)
    _ensure_no_schedule_conflict(mover.id, booking.id, event.starts_at, event.ends_at, confirmed_only=True)
    event.status = "CONFIRMED"
    event.save(update_fields=["status", "updated_at"])
    booking.scheduled_start_at = event.starts_at
    booking.scheduled_end_at = event.ends_at
    booking.updated_at = timezone.now()
    booking.save(update_fields=["scheduled_start_at", "scheduled_end_at", "updated_at"])
    return {"booking_id": str(booking.id), "schedule_id": str(event.id), "status": "CONFIRMED", "starts_at": event.starts_at, "ends_at": event.ends_at}


@transaction.atomic
def request_mover_booking(*, renter_id, mover_id, pickup_address, dropoff_address,
                          distance_km=None, pickup_latitude=None, pickup_longitude=None,
                          dropoff_latitude=None, dropoff_longitude=None, listing_id=None,
                          moving_date=None, preferred_payment_method=None):
    renter = _profile(renter_id)
    if renter.role != "renter":
        raise ValidationError("Only renters can request a mover")
    if not str(pickup_address or "").strip():
        raise ValidationError("Pickup address is required")
    if not str(dropoff_address or "").strip():
        raise ValidationError("Dropoff address is required")

    mover = Mover.objects.select_for_update().filter(
        pk=mover_id, is_available=True, approval_status="approved"
    ).first()
    if mover is None:
        raise ValidationError("Mover is not currently available")
    mover_profile = _profile(mover.user_id)
    if mover_profile.verification_status != "verified" or getattr(mover_profile, "mover_application_status", None) != "approved":
        raise ValidationError("Mover is not verified and approved")

    coordinates = (pickup_latitude, pickup_longitude, dropoff_latitude, dropoff_longitude)
    if all(value is not None for value in coordinates):
        distance = calculate_mover_distance(
            pickup_latitude=pickup_latitude,
            pickup_longitude=pickup_longitude,
            dropoff_latitude=dropoff_latitude,
            dropoff_longitude=dropoff_longitude,
        )
    else:
        try:
            distance = Decimal(str(distance_km)).quantize(TWOPLACES, rounding=ROUND_HALF_UP)
        except (TypeError, ValueError, ArithmeticError) as exc:
            raise ValidationError("A valid distance in kilometres is required when map coordinates are unavailable") from exc
        if not distance.is_finite() or distance <= 0 or distance > Decimal("10000"):
            raise ValidationError("Distance must be greater than zero and no more than 10,000 km")

    quote = calculate_mover_quote(mover_id=mover_id, distance_km=distance)

    requested_moving_date = timezone.localdate()
    if moving_date:
        try:
            requested_moving_date = date.fromisoformat(str(moving_date))
        except ValueError as exc:
            raise ValidationError("Moving date must be a valid ISO date") from exc
    if requested_moving_date < timezone.localdate():
        raise ValidationError("Moving date cannot be in the past")

    preferred = str(preferred_payment_method or "").strip().lower()
    if preferred not in {"", "mpesa", "paypal"}:
        raise ValidationError("Payment method must be M-Pesa or PayPal")

    now = timezone.now()
    deadline = now + timezone.timedelta(minutes=30)
    booking = Booking.objects.create(
        renter_id=renter_id, mover_id=mover_id, listing_id=listing_id,
        pickup_address=str(pickup_address), dropoff_address=str(dropoff_address),
        moving_date=requested_moving_date, booking_amount=quote["renter_total_kes"],
        commission_amount=quote["platform_fee_kes"], total_amount=quote["renter_total_kes"],
        status="pending", payment_status="unpaid", payment_method=preferred,
        distance_km=distance, rate_per_km_kes=quote["rate_per_km_kes"],
        base_rate_kes=quote["base_rate_kes"], pickup_latitude=pickup_latitude,
        pickup_longitude=pickup_longitude, dropoff_latitude=dropoff_latitude,
        dropoff_longitude=dropoff_longitude, requested_at=now,
        request_expires_at=deadline, created_at=now, updated_at=now,
    )
    conversation = _conversation(renter_id, mover.user_id)
    ChatMessage.objects.create(
        conversation_id=conversation, sender_id=renter_id, receiver_id=mover.user_id,
        content=(f"Moving request received. Please respond within 30 minutes. Pickup: {pickup_address}. "
                 f"Destination: {dropoff_address}. Distance: {float(distance):.2f} km. "
                 f"Estimated total: KES {quote['renter_total_kes']:,.2f}."),
        message_type="booking_request",
        event_data={
            "booking_id": str(booking.id), "distance_km": float(distance),
            "rate_per_km_kes": str(quote["rate_per_km_kes"]),
            "renter_total_kes": str(quote["renter_total_kes"]),
            "platform_fee_kes": str(quote["platform_fee_kes"]),
            "mover_net_kes": str(quote["mover_net_kes"]),
            "pickup_latitude": float(pickup_latitude) if pickup_latitude is not None else None,
            "pickup_longitude": float(pickup_longitude) if pickup_longitude is not None else None,
            "dropoff_latitude": float(dropoff_latitude) if dropoff_latitude is not None else None,
            "dropoff_longitude": float(dropoff_longitude) if dropoff_longitude is not None else None,
            "preferred_payment_method": preferred or None,
            "request_expires_at": deadline.isoformat(),
        },
    )
    UserNotification.objects.create(
        user_id=mover.user_id, notification_type="MOVER_REQUEST", title="New moving request",
        message="A renter has requested your moving service. You have 30 minutes to respond.",
        data={"booking_id": str(booking.id), "expires_at": deadline.isoformat()},
    )
    if mover_profile.email:
        NotificationEmail.objects.create(
            recipient=mover_profile.email, subject="New Saka Krib moving request",
            html_body="<p>You have received a new moving request on Saka Krib.</p><p>Please open the app to review and respond within 30 minutes.</p>",
            template_type="MOVER_REQUEST", status="pending",
        )
    return {
        "booking_id": str(booking.id), "conversation_id": conversation,
        "status": "pending", "request_expires_at": deadline,
        "quote": quote, "distance_km": float(distance),
    }


@transaction.atomic
def respond_to_mover_booking(*, mover_user_id, booking_id, decision, reason=None):
    if decision not in {"confirm", "not_sure", "cancel"}:
        raise ValidationError("Invalid decision")
    mover_ids = Mover.objects.filter(user_id=mover_user_id).values("id")
    booking = Booking.objects.select_for_update().filter(pk=booking_id, mover_id__in=mover_ids).first()
    if booking is None:
        raise ValidationError("Booking not found or unauthorized")
    if booking.status != "pending":
        raise ValidationError("Booking is no longer awaiting mover response")
    expires = booking.request_expires_at or (booking.requested_at + timezone.timedelta(minutes=30))
    if expires < timezone.now():
        booking.status = "cancelled"
        booking.cancelled_at = timezone.now()
        booking.cancellation_reason = "MOVER_TAKING_TOO_LONG"
        booking.updated_at = timezone.now()
        booking.save(update_fields=["status", "cancelled_at", "cancellation_reason", "updated_at"])
        raise ValidationError("The 30-minute response window has expired")
    if decision in {"not_sure", "cancel"} and not str(reason or "").strip():
        raise ValidationError("Reason is required")

    conversation = _conversation(booking.renter_id, mover_user_id)
    now = timezone.now()
    if decision == "confirm":
        booking.status = "confirmed"
        booking.confirmed_at = now
        booking.updated_at = now
        booking.save(update_fields=["status", "confirmed_at", "updated_at"])
        mover = Mover.objects.filter(pk=booking.mover_id).first()
        if mover is None:
            raise ValidationError("Mover not found")
        invoice = _ensure_moving_invoice(booking, mover)
        content = "The mover has accepted your request. Please select a moving date and time."
        UserNotification.objects.create(
            user_id=booking.renter_id, notification_type="MOVER_CONFIRMED",
            title="Mover confirmed your request", message="Your selected mover accepted the request. Choose a date and time in chat.",
            data={"booking_id": str(booking.id), "invoice_id": str(invoice.id), "invoice_number": invoice.invoice_number},
        )
    elif decision == "not_sure":
        content = f"The mover is not sure about this request yet: {reason}"
        UserNotification.objects.create(
            user_id=booking.renter_id, notification_type="MOVER_NOT_SURE",
            title="Mover is not sure", message="The mover needs more discussion before confirming.",
            data={"booking_id": str(booking.id), "reason": str(reason)},
        )
    else:
        booking.status = "cancelled"
        booking.cancelled_at = now
        booking.cancellation_reason = "MOVER_DECLINED"
        booking.cancellation_details = str(reason)[:2000]
        booking.updated_at = now
        booking.save(update_fields=["status", "cancelled_at", "cancellation_reason", "cancellation_details", "updated_at"])
        MovingCancellationEvent.objects.create(
            booking_id=booking.id, cancelled_by=mover_user_id,
            reason_code="MOVER_CANCELLED", reason_text=str(reason),
        )
        content = f"The mover cancelled the request: {reason}"
        UserNotification.objects.create(
            user_id=booking.renter_id, notification_type="MOVER_CANCELLED",
            title="Mover cancelled the request", message="The mover cancelled your moving request.",
            data={"booking_id": str(booking.id), "reason": str(reason)},
        )
    ChatMessage.objects.create(
        conversation_id=conversation, sender_id=mover_user_id, receiver_id=booking.renter_id,
        content=content, message_type="booking_response",
        event_data={"booking_id": str(booking.id), "decision": decision,
                    **({"reason": str(reason)} if reason else {})})
    return {"booking_id": str(booking.id), "decision": decision, "status": booking.status}


@transaction.atomic
def cancel_moving_booking(*, user_id, booking_id, reason_code, reason_text=""):
    valid = {"MOVER_DID_NOT_CONFIRM", "MOVER_TAKING_TOO_LONG", "CHANGED_MIND", "OTHER",
             "RENTER_CANCELLED", "MOVER_CANCELLED", "MOVER_UNAVAILABLE"}
    if reason_code not in valid:
        raise ValidationError("Invalid cancellation reason")
    booking = Booking.objects.select_for_update().filter(pk=booking_id).first()
    if booking is None:
        raise ValidationError("Booking not found")
    mover = Mover.objects.filter(pk=booking.mover_id).first()
    if booking.renter_id != user_id and (mover is None or mover.user_id != user_id):
        raise ValidationError("Not authorized to cancel this booking")
    if booking.status in {"completed", "cancelled"}:
        raise ValidationError("Booking cannot be cancelled in its current state")
    now = timezone.now()
    booking.status = "cancelled"
    booking.cancelled_at = now
    booking.cancellation_reason = reason_code
    booking.cancellation_details = str(reason_text or "")[:2000]
    booking.updated_at = now
    booking.save(update_fields=["status", "cancelled_at", "cancellation_reason", "cancellation_details", "updated_at"])
    MovingCancellationEvent.objects.create(
        booking_id=booking.id, cancelled_by=user_id,
        reason_code=reason_code, reason_text=str(reason_text or ""),
    )
    return {"booking_id": str(booking.id), "status": booking.status}
