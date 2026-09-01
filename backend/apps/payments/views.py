from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.listings.models import ListingPaymentIntent
from .services import get_provider


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
        intent = ListingPaymentIntent.objects.filter(pk=intent_id, user_id=request.user.profile.id, status='PENDING').first()
        if not intent:
            return Response({'detail': 'Pending listing payment intent not found.'}, status=404)
        currency = 'KES' if provider_name == 'mpesa' else 'USD'
        if provider_name == 'mpesa':
            amount = intent.amount_kes
        else:
            try:
                amount = request.data['amount_usd']
            except KeyError:
                return Response({'detail': 'amount_usd is required for PayPal.'}, status=400)
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
        intent.updated_at = timezone.now()
        intent.save(update_fields=['provider','provider_reference','provider_amount','provider_currency','updated_at'])
        return Response({'success': True, 'payment_intent_id': str(intent.id), 'provider': provider_name,
                         'provider_reference': result.provider_reference, 'message': result.message,
                         'provider_response': result.raw})


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
        with transaction.atomic():
            locked = ListingPaymentIntent.objects.select_for_update().get(pk=intent.id)
            if int(result_code or 1) == 0:
                # Settlement is deliberately isolated until the canonical payment finalizer is wired.
                locked.provider = 'MPESA'
                locked.provider_reference = checkout_id
                locked.provider_amount = items.get('Amount')
                locked.updated_at = timezone.now()
                locked.save(update_fields=['provider','provider_reference','provider_amount','updated_at'])
            else:
                locked.status = 'FAILED'
                locked.updated_at = timezone.now()
                locked.save(update_fields=['status','updated_at'])
        return Response({'ResultCode': 0, 'ResultDesc': 'Accepted'})


class PayPalListingCaptureView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        intent_id = request.data.get('payment_intent_id')
        order_id = request.data.get('order_id')
        if not intent_id or not order_id:
            return Response({'detail': 'payment_intent_id and order_id are required.'}, status=400)
        intent = ListingPaymentIntent.objects.filter(pk=intent_id, user_id=request.user.profile.id, status='PENDING').first()
        if not intent:
            return Response({'detail': 'Pending listing payment intent not found.'}, status=404)
        result = get_provider('paypal').verify_payment(provider_reference=order_id)
        if not result.success:
            return Response({'success': False, 'message': result.message, 'provider_response': result.raw}, status=402)
        return Response({'success': True, 'payment_captured': True, 'payment_intent_id': str(intent.id),
                         'provider_reference': order_id,
                         'message': 'PayPal payment captured; final settlement must be performed server-side.'})
