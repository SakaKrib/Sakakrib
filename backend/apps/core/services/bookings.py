"""Booking and mover-quote services.

This module is the Django equivalent of the production Supabase mover-booking
functions.  It deliberately keeps pricing and state transitions server-side,
uses row locks for concurrent requests, and preserves the canonical renter /
mover conversation identity used by the existing frontend.
"""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import Any
from uuid import UUID

from django.db import transaction
from django.utils import timezone

from apps.accounts.models import Profile
from apps.core.domain_bookings import (
    Booking,
    ChatMessage,
    MovingCancellationEvent,
)
from apps.core.domain_platform import (
    Mover,
    NotificationEmail,
    UserNotification,
)
from apps.core.domain_property import PlatformSettings


MONEY = Decimal("0.01")
DISTANCE = Decimal("0.001")
DEFAULT_COMMISSION_RATE = Decimal("0.20")
DEFAULT_MARKUP_RATE = Decimal("0")
REQUEST_WINDOW_MINUTES = 30


def _money(value: Decimal) -> Decimal:
    return Decimal(value).quantize(MONEY, rounding=ROUND_HALF_UP)


def _distance(value: Decimal) -> Decimal:
    return Decimal(value).quantize(DISTANCE, rounding=ROUND_HALF_UP)


def _conversation_id(user_a: UUID, user_b: UUID) -> str:
    """Return the canonical conversation key used by production Supabase."""
    first, second = sorted((str(user_a), str(user_b)))
    return f"{first}__{second}"


class MoverQuoteService:
    """Authoritative mover pricing equivalent to ``calculate_mover_quote``."""

    @staticmethod
    def calculate(mover_id: UUID, distance_km: Decimal | int | float) -> dict[str, Any]:
        distance = Decimal(str(distance_km)) if distance_km is not None else None
        if distance is None or distance < 0:
            raise ValueError("Distance must be zero or greater")

        mover = (
            Mover.objects
            .filter(id=mover_id, approval_status="approved", is_available=True)
            .first()
        )
        if mover is None:
            raise ValueError("Mover is not approved, unavailable, or does not exist")

        settings = PlatformSettings.objects.filter(id=True).first()
        commission_rate = (
            Decimal(settings.mover_commission_rate)
            if settings is not None
            else DEFAULT_COMMISSION_RATE
        )
        markup_rate = (
            Decimal(settings.mover_operational_markup_rate)
            if settings is not None
            else DEFAULT_MARKUP_RATE
        )

        distance_rounded = _distance(distance)
        base_rate = _money(Decimal(mover.base_rate_kes or 0))
        rate_per_km = _money(Decimal(mover.rate_per_km_kes or 0))
        mover_charge = _money(base_rate + (distance_rounded * rate_per_km))
        operational_markup = _money(mover_charge * markup_rate)
        renter_total = _money(mover_charge + operational_markup)
        commission = _money(mover_charge * commission_rate)
        net_mover = _money(renter_total - commission)

        return {
            "moverId": mover.id,
            "distanceKm": distance_rounded,
            "baseRateKes": base_rate,
            "ratePerKmKes": rate_per_km,
            "moverChargeKes": mover_charge,
            "operationalMarkupRate": markup_rate,
            "operationalMarkupKes": operational_markup,
            "commissionRate": commission_rate,
            "commissionKes": commission,
            "renterTotalKes": renter_total,
            "netMoverPayableKes": net_mover,
            "currency": "KES",
            # Compatibility aliases used by the older production function.
            "distance_km": _distance(distance),
            "base_rate_kes": base_rate,
            "rate_per_km_kes": rate_per_km,
            "renter_total_kes": renter_total,
            "platform_fee_kes": commission,
            "platform_commission_rate": commission_rate,
            "mover_net_kes": net_mover,
        }


class BookingService:
    """Transactional mover-booking workflows."""

    @staticmethod
    @transaction.atomic
    def request_mover_booking(
        *,
        renter: Profile,
        mover_id: UUID,
        pickup_address: str,
        dropoff_address: str,
        pickup_latitude: float,
        pickup_longitude: float,
        dropoff_latitude: float,
        dropoff_longitude: float,
        distance_km: Decimal | int | float,
        listing_id: UUID | None = None,
    ) -> dict[str, Any]:
        if renter is None:
            raise ValueError("Authentication required")
        if renter.role != "renter":
            raise ValueError("Only renters can request a mover")
        if not pickup_address or not pickup_address.strip():
            raise ValueError("Pickup address is required")
        if not dropoff_address or not dropoff_address.strip():
            raise ValueError("Dropoff address is required")

        def valid_lat(value: float) -> bool:
            return value is not None and -90 <= float(value) <= 90

        def valid_lng(value: float) -> bool:
            return value is not None and -180 <= float(value) <= 180

        if not valid_lat(pickup_latitude) or not valid_lat(dropoff_latitude):
            raise ValueError("Invalid latitude")
        if not valid_lng(pickup_longitude) or not valid_lng(dropoff_longitude):
            raise ValueError("Invalid longitude")

        mover = (
            Mover.objects.select_for_update()
            .filter(id=mover_id, is_available=True, approval_status="approved")
            .first()
        )
        if mover is None:
            raise ValueError("Mover is not currently available")

        mover_profile = Profile.objects.filter(id=mover.user_id).first()
        if (
            mover_profile is None
            or mover_profile.verification_status != "verified"
            or mover_profile.mover_application_status != "approved"
        ):
            raise ValueError("Mover is not verified and approved")

        quote = MoverQuoteService.calculate(mover.id, distance_km)
        now = timezone.now()
        deadline = now + timezone.timedelta(minutes=REQUEST_WINDOW_MINUTES)

        booking = Booking.objects.create(
            renter_id=renter.id,
            mover_id=mover.id,
            listing_id=listing_id,
            pickup_address=pickup_address,
            dropoff_address=dropoff_address,
            moving_date=timezone.localdate(),
            booking_amount=quote["renterTotalKes"],
            commission_amount=quote["commissionKes"],
            total_amount=quote["renterTotalKes"],
            status="pending",
            payment_status="unpaid",
            payment_method="",
            distance_km=quote["distanceKm"],
            rate_per_km_kes=quote["ratePerKmKes"],
            base_rate_kes=quote["baseRateKes"],
            pickup_latitude=pickup_latitude,
            pickup_longitude=pickup_longitude,
            dropoff_latitude=dropoff_latitude,
            dropoff_longitude=dropoff_longitude,
            requested_at=now,
            request_expires_at=deadline,
        )

        conversation_id = _conversation_id(renter.id, mover.user_id)
        distance_display = f"{float(quote['distanceKm']):.2f}"
        total_display = f"{quote['renterTotalKes']:,.2f}"
        content = (
            "Moving request received. Please respond within 30 minutes. "
            f"Pickup: {pickup_address}. Destination: {dropoff_address}. "
            f"Distance: {distance_display} km. Estimated total: KES {total_display}."
        )

        ChatMessage.objects.create(
            conversation_id=conversation_id,
            sender_id=renter.id,
            receiver_id=mover.user_id,
            content=content,
            message_type="booking_request",
            event_data={
                "booking_id": str(booking.id),
                "distance_km": str(quote["distanceKm"]),
                "rate_per_km_kes": str(quote["ratePerKmKes"]),
                "renter_total_kes": str(quote["renterTotalKes"]),
                "platform_fee_kes": str(quote["commissionKes"]),
                "mover_net_kes": str(quote["netMoverPayableKes"]),
                "pickup_latitude": pickup_latitude,
                "pickup_longitude": pickup_longitude,
                "dropoff_latitude": dropoff_latitude,
                "dropoff_longitude": dropoff_longitude,
                "request_expires_at": deadline.isoformat(),
            },
        )

        UserNotification.objects.create(
            user_id=mover.user_id,
            notification_type="MOVER_REQUEST",
            title="New moving request",
            message="A renter has requested your moving service. You have 30 minutes to respond.",
            data={"booking_id": str(booking.id), "expires_at": deadline.isoformat()},
        )

        NotificationEmail.objects.create(
            recipient=mover_profile.email,
            subject="New Saka Krib moving request",
            html_body=(
                "<p>You have received a new moving request on Saka Krib.</p>"
                "<p>Please open the app to review and respond within 30 minutes.</p>"
            ),
            template_type="MOVER_REQUEST",
            status="pending",
        )

        return {
            "booking_id": booking.id,
            "conversation_id": conversation_id,
            "status": booking.status,
            "request_expires_at": deadline,
            "quote": quote,
        }

    @staticmethod
    @transaction.atomic
    def respond_to_mover_booking(
        *, mover_user: Profile, booking_id: UUID, decision: str, reason: str | None = None
    ) -> dict[str, Any]:
        if mover_user is None:
            raise ValueError("Authentication required")
        if decision not in {"confirm", "not_sure", "cancel"}:
            raise ValueError("Invalid decision")

        booking = (
            Booking.objects.select_for_update()
            .filter(id=booking_id, mover_id__isnull=False)
            .first()
        )
        if booking is None:
            raise ValueError("Booking not found or unauthorized")

        mover = Mover.objects.filter(id=booking.mover_id, user_id=mover_user.id).first()
        if mover is None:
            raise ValueError("Booking not found or unauthorized")
        if booking.status != "pending":
            raise ValueError("Booking is no longer awaiting mover response")

        now = timezone.now()
        expiry = booking.request_expires_at
        if expiry is None and booking.requested_at is not None:
            expiry = booking.requested_at + timezone.timedelta(minutes=REQUEST_WINDOW_MINUTES)
        if expiry is not None and expiry < now:
            Booking.objects.filter(id=booking.id).update(
                status="cancelled",
                cancelled_at=now,
                cancellation_reason="MOVER_TAKING_TOO_LONG",
                updated_at=now,
            )
            raise ValueError("The 30-minute response window has expired")

        conversation_id = _conversation_id(booking.renter_id, mover_user.id)

        if decision == "confirm":
            Booking.objects.filter(id=booking.id).update(
                status="confirmed", confirmed_at=now, updated_at=now
            )
            ChatMessage.objects.create(
                conversation_id=conversation_id,
                sender_id=mover_user.id,
                receiver_id=booking.renter_id,
                content="The mover has accepted your request. Please select a moving date and time.",
                message_type="booking_response",
                event_data={"booking_id": str(booking.id), "decision": "confirm"},
            )
            UserNotification.objects.create(
                user_id=booking.renter_id,
                notification_type="MOVER_CONFIRMED",
                title="Mover confirmed your request",
                message="Your selected mover accepted the request. Choose a date and time in chat.",
                data={"booking_id": str(booking.id)},
            )
        elif decision == "not_sure":
            if not reason or not reason.strip():
                raise ValueError("Reason is required for not sure")
            ChatMessage.objects.create(
                conversation_id=conversation_id,
                sender_id=mover_user.id,
                receiver_id=booking.renter_id,
                content=f"The mover is not sure about this request yet: {reason}",
                message_type="booking_response",
                event_data={
                    "booking_id": str(booking.id),
                    "decision": "not_sure",
                    "reason": reason,
                },
            )
            UserNotification.objects.create(
                user_id=booking.renter_id,
                notification_type="MOVER_NOT_SURE",
                title="Mover is not sure",
                message="The mover needs more discussion before confirming.",
                data={"booking_id": str(booking.id), "reason": reason},
            )
        else:
            if not reason or not reason.strip():
                raise ValueError("Reason is required for cancellation")
            Booking.objects.filter(id=booking.id).update(
                status="cancelled",
                cancelled_at=now,
                cancellation_reason="MOVER_DECLINED",
                cancellation_details=reason,
                updated_at=now,
            )
            MovingCancellationEvent.objects.create(
                booking_id=booking.id,
                cancelled_by=mover_user.id,
                reason_code="MOVER_CANCELLED",
                reason_text=reason,
            )
            ChatMessage.objects.create(
                conversation_id=conversation_id,
                sender_id=mover_user.id,
                receiver_id=booking.renter_id,
                content=f"The mover cancelled the request: {reason}",
                message_type="booking_response",
                event_data={
                    "booking_id": str(booking.id),
                    "decision": "cancel",
                    "reason": reason,
                },
            )
            UserNotification.objects.create(
                user_id=booking.renter_id,
                notification_type="MOVER_CANCELLED",
                title="Mover cancelled the request",
                message="The mover cancelled your moving request.",
                data={"booking_id": str(booking.id), "reason": reason},
            )

        current_status = Booking.objects.values_list("status", flat=True).get(id=booking.id)
        return {"booking_id": booking.id, "decision": decision, "status": current_status}
