import hmac

from django.conf import settings
from django.core.exceptions import ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .domain_bookings import MoverPayout
from .moving_lifecycle_services import confirm_moving_delivery, open_moving_dispute, resolve_moving_dispute
from .moving_payment_services import (
    finalize_mover_payout, finalize_moving_mpesa_callback,
    release_moving_escrow, start_moving_mpesa_payment, start_moving_paypal_payment,
)
from .moving_paypal_webhook_services import finalize_moving_paypal_webhook


def _error(exc):
    return Response({"detail": str(exc)}, status=400)


class MovingMpesaStartView(APIView):
    permission_classes=[IsAuthenticated]
    def post(self,request,booking_id):
        try: return Response(start_moving_mpesa_payment(renter_id=request.user.id,booking_id=booking_id))
        except (ValidationError,TypeError,ValueError,RuntimeError) as exc: return _error(exc)


class MovingMpesaCallbackView(APIView):
    permission_classes=[AllowAny]; authentication_classes=[]
    def post(self,request):
        callback=request.data.get("Body",{}).get("stkCallback",{}); checkout_id=callback.get("CheckoutRequestID")
        if not checkout_id: return Response({"ResultCode":0,"ResultDesc":"Accepted"})
        try:
            items={item.get("Name"):item.get("Value") for item in callback.get("CallbackMetadata",{}).get("Item",[])}
            result=finalize_moving_mpesa_callback(checkout_request_id=checkout_id,result_code=callback.get("ResultCode"),result_description=callback.get("ResultDesc"),callback_metadata=items,merchant_request_id=callback.get("MerchantRequestID"))
            return Response({"ResultCode":0,"ResultDesc":"Accepted",**result})
        except (ValidationError,TypeError,ValueError) as exc: return Response({"ResultCode":0,"ResultDesc":"Accepted","processing_error":str(exc)})


class MovingPaypalStartView(APIView):
    permission_classes=[IsAuthenticated]
    def post(self,request,booking_id):
        try: return Response(start_moving_paypal_payment(renter_id=request.user.id,booking_id=booking_id))
        except (ValidationError,TypeError,ValueError,RuntimeError) as exc: return _error(exc)


class MovingPaypalWebhookView(APIView):
    permission_classes=[AllowAny]; authentication_classes=[]
    def post(self,request):
        try: return Response(finalize_moving_paypal_webhook(headers=request.headers,raw_body=request.body))
        except PermissionError as exc: return Response({"success":False,"error":str(exc)},status=401)
        except (ValidationError,TypeError,ValueError) as exc: return Response({"success":False,"error":str(exc)},status=400)
        except RuntimeError as exc: return Response({"success":False,"error":str(exc)},status=503)


class MovingEscrowReleaseView(APIView):
    permission_classes=[IsAuthenticated]
    def post(self,request,booking_id):
        try: return Response(release_moving_escrow(admin_user_id=request.user.id,booking_id=booking_id))
        except (ValidationError,TypeError,ValueError) as exc: return _error(exc)


class MoverPayoutCallbackView(APIView):
    permission_classes=[AllowAny]; authentication_classes=[]

    def post(self,request):
        secret = str(getattr(settings, "MPESA_PAYOUT_CALLBACK_SECRET", "") or "").strip()
        if not secret:
            return Response({"success":False,"error":"Payout callback authentication is not configured"}, status=503)

        supplied = str(request.headers.get("X-Saka-Payout-Signature", "")).strip()
        if not supplied or not hmac.compare_digest(supplied, secret):
            return Response({"success":False,"error":"Invalid callback signature"}, status=401)

        payload=request.data or {}
        result_code = payload.get("ResultCode")
        provider = str(payload.get("provider") or "MPESA").upper()
        provider_reference = (
            payload.get("provider_reference")
            or payload.get("OriginatorConversationID")
            or payload.get("ConversationID")
            or payload.get("reference")
            or payload.get("conversation_id")
            or payload.get("originator_conversation_id")
        )
        provider_transaction_id = (
            payload.get("provider_transaction_id")
            or payload.get("TransactionID")
            or payload.get("MpesaReceiptNumber")
            or payload.get("transaction_id")
        )
        success = payload.get("success")
        if result_code is not None:
            try:
                success = int(result_code) == 0
            except (TypeError, ValueError):
                success = False
        elif isinstance(success,str):
            success=success.lower() in {"true","1","success","completed"}

        if not provider_reference:
            return Response({"success":False,"error":"Missing payout provider reference"},status=400)

        payout_id = payload.get("payout_id")
        if not payout_id:
            payout_id = MoverPayout.objects.filter(
                payout_provider="MPESA",
                payout_provider_reference=str(provider_reference),
            ).values_list("id", flat=True).first()

        if not payout_id:
            return Response({"success":True,"status":"IGNORED"})

        try:
            result = finalize_mover_payout(
                payout_id=payout_id,
                provider=provider,
                provider_reference=provider_reference,
                provider_transaction_id=provider_transaction_id,
                success=bool(success),
                failure_reason=payload.get("failure_reason") or payload.get("ResultDesc") or payload.get("Result",{}).get("ResultDesc"),
            )
            return Response({"success":True,**result,"transaction_id":provider_transaction_id})
        except (ValidationError,TypeError,ValueError) as exc: return _error(exc)


class MovingDeliveryConfirmView(APIView):
    permission_classes=[IsAuthenticated]
    def post(self,request,booking_id):
        try: return Response(confirm_moving_delivery(user_id=request.user.id,booking_id=booking_id))
        except (ValidationError,TypeError,ValueError) as exc: return _error(exc)


class MovingDisputeOpenView(APIView):
    permission_classes=[IsAuthenticated]
    def post(self,request,booking_id):
        try: return Response(open_moving_dispute(user_id=request.user.id,booking_id=booking_id,reason_code=request.data.get("reason_code"),description=request.data.get("description")))
        except (ValidationError,TypeError,ValueError) as exc: return _error(exc)


class MovingDisputeResolveView(APIView):
    permission_classes=[IsAuthenticated]
    def post(self,request,dispute_id):
        try: return Response(resolve_moving_dispute(admin_user_id=request.user.id,dispute_id=dispute_id,resolution_code=request.data.get("resolution_code"),resolution_notes=request.data.get("resolution_notes")))
        except (ValidationError,TypeError,ValueError) as exc: return _error(exc)
