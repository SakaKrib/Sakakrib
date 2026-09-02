from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import Profile

from .domain_bookings import Booking, ChatMessage, MovingCancellationEvent
from .domain_platform import Mover, NotificationEmail, UserNotification
from .domain_property import PlatformSettings

TWOPLACES = Decimal("0.01")


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


@transaction.atomic
def request_mover_booking(*, renter_id, mover_id, pickup_address, dropoff_address,
                          distance_km=None, pickup_latitude=None, pickup_longitude=None,
                          dropoff_latitude=None, dropoff_longitude=None, listing_id=None,
                          agreed_amount=None, moving_date=None, preferred_payment_method=None):
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

    amount = _money(agreed_amount)
    if amount <= 0:
        raise ValidationError("Agreed service amount must be greater than zero")

    platform = _platform_settings()
    fee = _money(amount * platform.mover_commission_rate)
    total = _money(amount + fee)

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

    distance = None
    if distance_km not in (None, ""):
        distance = Decimal(str(distance_km))
        if distance < 0:
            raise ValidationError("Invalid distance")

    coordinates = [
        (pickup_latitude, "pickup latitude", -90, 90),
        (dropoff_latitude, "dropoff latitude", -90, 90),
        (pickup_longitude, "pickup longitude", -180, 180),
        (dropoff_longitude, "dropoff longitude", -180, 180),
    ]
    for value, name, low, high in coordinates:
        if value is not None and not low <= float(value) <= high:
            raise ValidationError(f"Invalid {name}")

    now = timezone.now()
    deadline = now + timezone.timedelta(minutes=30)
    booking = Booking.objects.create(
        renter_id=renter_id, mover_id=mover_id, listing_id=listing_id,
        pickup_address=str(pickup_address), dropoff_address=str(dropoff_address),
        moving_date=requested_moving_date, booking_amount=amount,
        commission_amount=fee, total_amount=total,
        status="pending", payment_status="unpaid", payment_method=preferred,
        distance_km=distance, rate_per_km_kes=_money(mover.rate_per_km_kes),
        base_rate_kes=_money(mover.base_rate_kes), pickup_latitude=pickup_latitude,
        pickup_longitude=pickup_longitude, dropoff_latitude=dropoff_latitude,
        dropoff_longitude=dropoff_longitude, requested_at=now,
        request_expires_at=deadline, created_at=now, updated_at=now,
    )
    conversation = _conversation(renter_id, mover.user_id)
    distance_text = f"{float(distance):.2f} km" if distance is not None else "not specified"
    ChatMessage.objects.create(
        conversation_id=conversation, sender_id=renter_id, receiver_id=mover.user_id,
        content=(f"Moving request received. Please respond within 30 minutes. Pickup: {pickup_address}. "
                 f"Destination: {dropoff_address}. Distance: {distance_text}. "
                 f"Estimated total: KES {total:,.2f}."),
        message_type="booking_request",
        event_data={
            "booking_id": str(booking.id),
            "distance_km": float(distance) if distance is not None else None,
            "rate_per_km_kes": str(mover.rate_per_km_kes),
            "agreed_amount_kes": str(amount),
            "platform_fee_kes": str(fee),
            "renter_total_kes": str(total),
            "mover_net_kes": str(_money(total - fee)),
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
        "quote": {
            "mover_id": str(mover.id),
            "distance_km": round(float(distance), 2) if distance is not None else None,
            "base_rate_kes": _money(mover.base_rate_kes),
            "rate_per_km_kes": _money(mover.rate_per_km_kes),
            "agreed_amount_kes": amount,
            "renter_total_kes": total,
            "platform_fee_kes": fee,
            "platform_commission_rate": platform.mover_commission_rate,
            "mover_net_kes": _money(total - fee),
        },
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
        content = "The mover has accepted your request. Please select a moving date and time."
        UserNotification.objects.create(
            user_id=booking.renter_id, notification_type="MOVER_CONFIRMED",
            title="Mover confirmed your request", message="Your selected mover accepted the request. Choose a date and time in chat.",
            data={"booking_id": str(booking.id)},
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
    mover_user_id = mover.user_id if mover else None
    if booking.renter_id == user_id:
        actor = "RENTER"
        if reason_code in {"MOVER_CANCELLED", "MOVER_UNAVAILABLE"}:
            raise ValidationError("Invalid renter cancellation reason")
    elif mover_user_id == user_id:
        actor = "MOVER"
        if reason_code in {"MOVER_DID_NOT_CONFIRM", "MOVER_TAKING_TOO_LONG", "CHANGED_MIND"}:
            raise ValidationError("Invalid mover cancellation reason")
    else:
        raise ValidationError("Booking not found or unauthorized")
    if booking.status in {"cancelled", "completed"}:
        return {"booking_id": str(booking.id), "status": booking.status, "already_final": True}
    if booking.status not in {"pending", "confirmed"}:
        raise ValidationError("Booking cannot be cancelled after the journey has started")
    if booking.payment_status not in {"unpaid", "pending", "failed"}:
        raise ValidationError("Paid booking requires the payment/refund flow and cannot be cancelled here")
    now = timezone.now()
    booking.status = "cancelled"
    booking.cancelled_at = now
    booking.cancellation_reason = reason_code
    booking.cancellation_details = str(reason_text)[:2000]
    booking.updated_at = now
    booking.save(update_fields=["status", "cancelled_at", "cancellation_reason", "cancellation_details", "updated_at"])
    MovingCancellationEvent.objects.create(
        booking_id=booking.id, cancelled_by=user_id, reason_code=reason_code, reason_text=reason_text,
    )
    return {"booking_id": str(booking.id), "status": "cancelled", "cancelled_by": actor}
