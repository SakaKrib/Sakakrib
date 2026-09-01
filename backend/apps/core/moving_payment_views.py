from django.core.exceptions import ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .moving_payment_services import (
    finalize_moving_mpesa_callback,
    finalize_moving_paypal_webhook,
    release_moving_escrow,
    start_moving_mpesa_payment,
    start_moving_paypal_payment,
)


def _error(exc):
    return Response({"detail": str(exc)}, status=400)


class MovingMpesaStartView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, booking_id):
        try:
            return Response(start_moving_mpesa_payment(
                renter_id=request.user.id,
                booking_id=booking_id,
            ))
        except (ValidationError, TypeError, ValueError, RuntimeError) as exc:
            return _error(exc)


class MovingMpesaCallbackView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        callback = request.data.get("Body", {}).get("stkCallback", {})
        checkout_id = callback.get("CheckoutRequestID")
        if not checkout_id:
            return Response({"ResultCode": 0, "ResultDesc": "Accepted"})
        try:
            items = {
                item.get("Name"): item.get("Value")
                for item in callback.get("CallbackMetadata", {}).get("Item", [])
            }
            result = finalize_moving_mpesa_callback(
                checkout_request_id=checkout_id,
                result_code=callback.get("ResultCode"),
                result_description=callback.get("ResultDesc"),
                callback_metadata=items,
                merchant_request_id=callback.get("MerchantRequestID"),
            )
            return Response({"ResultCode": 0, "ResultDesc": "Accepted", **result})
        except (ValidationError, TypeError, ValueError) as exc:
            return Response({"ResultCode": 0, "ResultDesc": "Accepted", "processing_error": str(exc)})


class MovingPaypalStartView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, booking_id):
        try:
            return Response(start_moving_paypal_payment(
                renter_id=request.user.id,
                booking_id=booking_id,
            ))
        except (ValidationError, TypeError, ValueError, RuntimeError) as exc:
            return _error(exc)


class MovingPaypalWebhookView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        try:
            result = finalize_moving_paypal_webhook(
                headers=request.headers,
                raw_body=request.body,
            )
            return Response(result)
        except PermissionError as exc:
            return Response({"success": False, "error": str(exc)}, status=401)
        except (ValidationError, TypeError, ValueError) as exc:
            return Response({"success": False, "error": str(exc)}, status=400)
        except RuntimeError as exc:
            return Response({"success": False, "error": str(exc)}, status=503)


class MovingEscrowReleaseView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, booking_id):
        try:
            return Response(release_moving_escrow(
                admin_user_id=request.user.id,
                booking_id=booking_id,
            ))
        except (ValidationError, TypeError, ValueError) as exc:
            return _error(exc)
