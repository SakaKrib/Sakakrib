from django.core.exceptions import ValidationError
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import Profile

from .domain_bookings import Booking, MoverScheduleEvent
from .domain_platform import Mover
from .moving_services import (
    calculate_mover_quote,
    cancel_moving_booking,
    request_mover_booking,
    respond_to_mover_booking,
)


def _error(exc):
    return Response({"detail": str(exc)}, status=400)


class MoverQuoteView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            return Response(calculate_mover_quote(
                mover_id=request.data.get("mover_id"),
                distance_km=request.data.get("distance_km"),
            ))
        except (ValidationError, TypeError, ValueError) as exc:
            return _error(exc)


class MoverBookingRequestView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            result = request_mover_booking(
                renter_id=request.user.id,
                mover_id=request.data.get("mover_id"),
                listing_id=request.data.get("listing_id"),
                pickup_address=request.data.get("pickup_address"),
                dropoff_address=request.data.get("dropoff_address"),
                distance_km=request.data.get("distance_km"),
                pickup_latitude=request.data.get("pickup_latitude"),
                pickup_longitude=request.data.get("pickup_longitude"),
                dropoff_latitude=request.data.get("dropoff_latitude"),
                dropoff_longitude=request.data.get("dropoff_longitude"),
                moving_date=request.data.get("moving_date"),
                preferred_payment_method=request.data.get("preferred_payment_method"),
            )
            return Response(result, status=201)
        except (ValidationError, TypeError, ValueError) as exc:
            return _error(exc)


class MoverBookingDetailView(APIView):
    """Mover-owner booking detail used by the mover booking page."""
    permission_classes = [IsAuthenticated]

    def get(self, request, booking_id):
        mover = Mover.objects.filter(user_id=request.user.id).first()
        if mover is None:
            return Response({"detail": "Mover profile not found."}, status=404)

        booking = Booking.objects.filter(pk=booking_id, mover_id=mover.id).first()
        if booking is None:
            return Response({"detail": "Booking not found."}, status=404)

        renter = Profile.objects.filter(pk=booking.renter_id).first()
        schedule = MoverScheduleEvent.objects.filter(booking_id=booking.id).order_by("-starts_at").first()
        contact_released = booking.contact_released_at is not None

        renter_data = None
        if renter is not None:
            renter_data = {
                "id": str(renter.id),
                "full_name": renter.full_name,
                "phone": renter.phone if contact_released else None,
                "profile_photo_url": renter.profile_photo_url,
                "city": renter.city,
                "county": renter.county,
            }

        mover_data = {
            "id": str(mover.id),
            "driver_full_name": mover.driver_full_name,
            "business_name": mover.business_name,
            "phone": mover.phone,
            "vehicle_type": mover.vehicle_type,
            "number_plate": mover.number_plate,
            "operating_city": mover.operating_city,
            "operating_county": mover.operating_county,
            "base_rate_kes": mover.base_rate_kes,
            "rate_per_km_kes": mover.rate_per_km_kes,
            "approval_status": mover.approval_status,
        }

        schedule_data = None
        if schedule is not None:
            schedule_data = {
                "id": str(schedule.id),
                "starts_at": schedule.starts_at,
                "ends_at": schedule.ends_at,
                "status": schedule.status,
                "title": schedule.title,
            }

        response_deadline = booking.request_expires_at
        can_respond = booking.status == "pending" and (
            response_deadline is None or response_deadline > timezone.now()
        )

        booking_data = {
            "id": str(booking.id),
            "renter_id": str(booking.renter_id),
            "mover_id": str(booking.mover_id),
            "listing_id": str(booking.listing_id) if booking.listing_id else None,
            "pickup_address": booking.pickup_address,
            "dropoff_address": booking.dropoff_address,
            "moving_date": booking.moving_date,
            "booking_amount": booking.booking_amount,
            "commission_amount": booking.commission_amount,
            "total_amount": booking.total_amount,
            "status": booking.status,
            "payment_status": booking.payment_status,
            "payment_method": booking.payment_method,
            "distance_km": booking.distance_km,
            "rate_per_km_kes": booking.rate_per_km_kes,
            "base_rate_kes": booking.base_rate_kes,
            "pickup_latitude": booking.pickup_latitude,
            "pickup_longitude": booking.pickup_longitude,
            "dropoff_latitude": booking.dropoff_latitude,
            "dropoff_longitude": booking.dropoff_longitude,
            "requested_at": booking.requested_at,
            "request_expires_at": booking.request_expires_at,
            "confirmed_at": booking.confirmed_at,
            "scheduled_start_at": booking.scheduled_start_at,
            "scheduled_end_at": booking.scheduled_end_at,
            "started_at": booking.started_at,
            "completed_at": booking.completed_at,
            "cancelled_at": booking.cancelled_at,
            "cancellation_reason": booking.cancellation_reason,
            "cancellation_details": booking.cancellation_details,
            "tracking_number": booking.tracking_number,
            "renter_confirmed_delivery_at": booking.renter_confirmed_delivery_at,
            "mover_confirmed_delivery_at": booking.mover_confirmed_delivery_at,
            "contact_released_at": booking.contact_released_at,
            "dispute_status": booking.dispute_status,
            "created_at": booking.created_at,
            "updated_at": booking.updated_at,
        }

        return Response({
            "booking": booking_data,
            "renter": renter_data,
            "mover": mover_data,
            "schedule": schedule_data,
            "response_deadline": response_deadline,
            "can_respond": can_respond,
            "contact_released": contact_released,
        })


class MoverBookingResponseView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, booking_id):
        try:
            result = respond_to_mover_booking(
                mover_user_id=request.user.id,
                booking_id=booking_id,
                decision=request.data.get("decision"),
                reason=request.data.get("reason"),
            )
            return Response(result)
        except (ValidationError, TypeError, ValueError) as exc:
            return _error(exc)


class MovingBookingCancelView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, booking_id):
        try:
            result = cancel_moving_booking(
                user_id=request.user.id,
                booking_id=booking_id,
                reason_code=request.data.get("reason_code"),
                reason_text=request.data.get("reason_text", ""),
            )
            return Response(result)
        except (ValidationError, TypeError, ValueError) as exc:
            return _error(exc)
