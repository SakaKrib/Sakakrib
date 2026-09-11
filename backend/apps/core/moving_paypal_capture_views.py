from django.core.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .moving_paypal_capture import capture_moving_paypal_payment


class MovingPaypalCaptureView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, booking_id):
        try:
            return Response(
                capture_moving_paypal_payment(
                    renter_id=request.user.id,
                    booking_id=booking_id,
                    order_id=request.data.get("order_id"),
                )
            )
        except (ValidationError, TypeError, ValueError, RuntimeError) as exc:
            return Response({"detail": str(exc)}, status=400)
