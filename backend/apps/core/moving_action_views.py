from django.core.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

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
            )
            return Response(result, status=201)
        except (ValidationError, TypeError, ValueError) as exc:
            return _error(exc)


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
