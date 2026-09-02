from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.listings.models import ListingPaymentIntent
from .services import get_exchange_rate, get_provider
from .models import ListingPayment
from apps.listings.services import finalize_listing_payment


class PaymentProviderConfigView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({'providers': {
            'mpesa': {'enabled': bool(settings.MPESA_CONSUMER_KEY), 'currency': 'KES'},
            'paypal': {'enabled': bool(settings.PAYPAL_CLIENT_ID), 'currency': 'USD'},
        }})


class ListingPaymentStartView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        intent_id = request.data.get('payment_intent_id')
        provider_name = str(request.data.get('provider', '')).lower()
        if not intent_id or provider_name not in ('mpesa', 'paypal'):
            return Response({'detail': 'payment_intent_id and provider (mpesa or paypal) are required.'}, status=400)
        intent = ListingPaymentIntent.objects.filter(pk=intent_id, user_id=request.user.pk, status='PENDING').first()
        if not intent:
            return Response({'detail': 'Pending listing payment intent not found.'}, status=404)

        if provider_name == 'mpesa':
            amount = intent.amount_kes
            currency = 'KES'
            fx_rate = None
        else:
            # The browser may choose the provider, but it must never choose the
            # authoritative USD amount. Production derives this from KES 1,000
            # using the server-side KES/USD rate before creating the PayPal order.
            try:
                fx_rate = get_exchange_rate('KES', 'USD')
                amount = (intent.amount_kes * fx_rate).quantize(Decimal('0.01'))
            except Exception as exc:
                return Response({'success': False, 'message': str(exc)}, status=503)
            currency = 'USD'

        result = get_provider(provider_name).create_payment(
            amount=amount, currency=currency, reference=str(intent.id),
            metadata={'phone_number': request.data.get('phone_number'), 'description': 'SakaKrib listing'},
        )
        if not result.success:
            return Response({'success': False, 'message': result.message, 'provider_response': result.raw}, status=502)

        intent.provider = provider_name.upper()
        intent.provider_reference = result.provider_reference
        intent.provider_amount = amount
        intent.provider_currency = currency
        intent.paypal_fx_rate = fx_rate
        intent.updated_at = timezone.now()
        intent.save(update_fields=['provider','provider_reference','provider_amount','provider_currency','paypal_fx_rate','updated_at'])
        return Response({'success': True, 'payment_intent_id': str(intent.id), 'provider': provider_name,
                         'provider_reference': result.provider_reference, 'provider_amount': str(amount),
                         'provider_currency': currency, 'paypal_fx_rate': str(fx_rate) if fx_rate else None,
                         'message': result.message, 'provider_response': result.raw})


class MpesaListingCallbackView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        callback = request.data.get('Body', {}).get('stkCallback', {})
        checkout_id = callback.get('CheckoutRequestID')
        result_code = callback.get('ResultCode')
        if not checkout_id:
            return Response({'ResultCode': 0, 'ResultDesc': 'Accepted'})
        intent = ListingPaymentIntent.objects.filter(provider_reference=checkout_id, status='PENDING').first()
        if not intent:
            return Response({'ResultCode': 0, 'ResultDesc': 'Accepted'})
        items = {item.get('Name'): item.get('Value') for item in callback.get('CallbackMetadata', {}).get('Item', [])}
        if int(result_code or 1) != 0:
            intent.status = 'FAILED'; intent.updated_at = timezone.now()
            intent.save(update_fields=['status','updated_at'])
            return Response({'ResultCode': 0, 'ResultDesc': 'Accepted'})
        try:
            with transaction.atomic():
                result = finalize_listing_payment(
                    intent.id, provider='MPESA', provider_reference=checkout_id,
                    provider_amount=items.get('Amount'), provider_currency='KES', checkout_request_id=checkout_id,
                    merchant_request_id=callback.get('MerchantRequestID'), mpesa_receipt=items.get('MpesaReceiptNumber'),
                    phone_number=items.get('PhoneNumber'), result_code=result_code,
                    result_description=callback.get('ResultDesc'), provider_transaction_id=items.get('MpesaReceiptNumber'),
                )
        except Exception as exc:
            return Response({'ResultCode': 1, 'ResultDesc': f'Settlement failed: {exc}'}, status=500)
        return Response({'ResultCode': 0, 'ResultDesc': 'Accepted', 'listing_id': str(result['listing_id'])})


class PayPalListingCaptureView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        intent_id = request.data.get('payment_intent_id')
        order_id = request.data.get('order_id')
        if not intent_id or not order_id:
            return Response({'detail': 'payment_intent_id and order_id are required.'}, status=400)
        intent = ListingPaymentIntent.objects.filter(pk=intent_id, user_id=request.user.pk, status='PENDING').first()
        if not intent:
            return Response({'detail': 'Pending listing payment intent not found.'}, status=404)
        result = get_provider('paypal').verify_payment(provider_reference=order_id)
        if not result.success:
            return Response({'success': False, 'message': result.message, 'provider_response': result.raw}, status=402)
        if intent.provider != 'PAYPAL' or intent.provider_reference != order_id:
            return Response({'success': False, 'message': 'PayPal order does not match the payment intent.'}, status=400)
        if not intent.provider_amount or intent.provider_currency != 'USD' or not intent.paypal_fx_rate:
            return Response({'success': False, 'message': 'Payment intent has no valid server-side USD/FX settlement data.'}, status=400)
        try:
            with transaction.atomic():
                settled = finalize_listing_payment(
                    intent.id, provider='PAYPAL', provider_reference=order_id,
                    provider_amount=intent.provider_amount, provider_currency='USD',
                    paypal_order_id=order_id, paypal_fx_rate=intent.paypal_fx_rate,
                    result_description=result.message,
                )
        except Exception as exc:
            return Response({'success': False, 'message': f'Payment captured but settlement failed: {exc}'}, status=500)
        return Response({**settled, 'payment_captured': True, 'provider_reference': order_id})
