"""Booking and mover-quote services.

The implementation mirrors the production Supabase mover-booking workflows,
while moving authorization, pricing, transactions, notifications and state
changes into Django-owned services.
"""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Any
from uuid import UUID

from django.db import transaction
from django.utils import timezone

from apps.accounts.models import Profile
from apps.core.domain_bookings import Booking, ChatMessage, MovingCancellationEvent
from apps.core.domain_platform import Mover, NotificationEmail, UserNotification
from apps.core.domain_property import PlatformSettings

MONEY = Decimal("0.01")
DISTANCE = Decimal("0.001")
DEFAULT_COMMISSION_RATE = Decimal("0.20")
REQUEST_WINDOW_MINUTES = 30


def _money(value: Decimal) -> Decimal:
    return Decimal(value).quantize(MONEY, rounding=ROUND_HALF_UP)


def _distance(value: Decimal) -> Decimal:
    return Decimal(value).quantize(DISTANCE, rounding=ROUND_HALF_UP)


def _conversation_id(user_a: UUID, user_b: UUID) -> str:
    first, second = sorted((str(user_a), str(user_b)))
    return f"{first}__{second}"


class MoverQuoteService:
    """Authoritative equivalent of production ``calculate_mover_quote``."""

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

        distance_rounded = _distance(distance)
        base_rate = _money(Decimal(mover.base_rate_kes or 0))
        rate_per_km = _money(Decimal(mover.rate_per_km_kes or 0))
        renter_total = _money(base_rate + (rate_per_km * distance_rounded))
        platform_fee = _money(renter_total * commission_rate)
        mover_net = _money(renter_total - platform_fee)

        return {
            "mover_id": mover.id,
            "distance_km": distance_rounded,
            "base_rate_kes": base_rate,
            "rate_per_km_kes": rate_per_km,
            "renter_total_kes": renter_total,
            "platform_fee_kes": platform_fee,
            "platform_commission_rate": commission_rate,
            "mover_net_kes": mover_net,
            # Frontend-compatible aliases from the newer quote contract.
            "moverId": mover.id,
            "distanceKm": distance_rounded,
            "baseRateKes": base_rate,
            "ratePerKmKes": rate_per_km,
            "renterTotalKes": renter_total,
            "commissionKes": platform_fee,
            "commissionRate": commission_rate,
            "netMoverPayableKes": mover_net,
            "currency": "KES",
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

        if (
            pickup_latitude is None
            or dropoff_latitude is None
            or not -90 <= float(pickup_latitude) <= 90
            or not -90 <= float(dropoff_latitude) <= 90
        ):
            raise ValueError("Invalid latitude")
        if (
            pickup_longitude is None
            or dropoff_longitude is None
            or not -180 <= float(pickup_longitude) <= 180
            or not -180 <= float(dropoff_longitude) <= 180
        ):
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
        deadline = now + timedelta(minutes=REQUEST_WINDOW_MINUTES)

        booking = Booking.objects.create(
            renter_id=renter.id,
            mover_id=mover.id,
            listing_id=listing_id,
            pickup_address=pickup_address,
            dropoff_address=dropoff_address,
            moving_date=timezone.localdate(),
            booking_amount=quote["renter_total_kes"],
            commission_amount=quote["platform_fee_kes"],
            total_amount=quote["renter_total_kes"],
            status="pending",
            payment_status="unpaid",
            payment_method="",
            distance_km=quote["distance_km"],
            rate_per_km_kes=quote["rate_per_km_kes"],
            base_rate_kes=quote["base_rate_kes"],
            pickup_latitude=pickup_latitude,
            pickup_longitude=pickup_longitude,
            dropoff_latitude=dropoff_latitude,
            dropoff_longitude=dropoff_longitude,
            requested_at=now,
            request_expires_at=deadline,
        )

        conversation_id = _conversation_id(renter.id, mover.user_id)
        content = (
            "Moving request received. Please respond within 30 minutes. "
            f"Pickup: {pickup_address}. Destination: {dropoff_address}. "
            f"Distance: {float(quote['distance_km']):.2f} km. "
            f"Estimated total: KES {quote['renter_total_kes']:,.2f}."
        )

        ChatMessage.objects.create(
            conversation_id=conversation_id,
            sender_id=renter.id,
            receiver_id=mover.user_id,
            content=content,
            message_type="booking_request",
            event_data={
                "booking_id": str(booking.id),
                "distance_km": str(quote["distance_km"]),
                "rate_per_km_kes": str(quote["rate_per_km_kes"]),
                "renter_total_kes": str(quote["renter_total_kes"]),
                "platform_fee_kes": str(quote["platform_fee_kes"]),
                "mover_net_kes": str(quote["mover_net_kes"]),
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

        booking = Booking.objects.select_for_update().filter(id=booking_id).first()
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
            expiry = booking.requested_at + timedelta(minutes=REQUEST_WINDOW_MINUTES)
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
