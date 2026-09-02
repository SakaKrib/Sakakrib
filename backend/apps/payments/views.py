from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.listings.models import ListingPaymentIntent
from apps.listings.payment_services import process_listing_payment
from .services import get_exchange_rate, get_provider


def _normalize_kenyan_phone(phone: str) -> str:
    value = ''.join(str(phone).strip().split())
    if value.startswith('+254'):
        return value[1:]
    if value.startswith('254'):
        return value
    if value.startswith('07') or value.startswith('01'):
        return f'254{value[1:]}'
    raise ValueError('Invalid Kenyan phone number')


def _paypal_capture_details(raw):
    purchase_units = raw.get('purchase_units') or []
    captures = ((purchase_units[0] or {}).get('payments') or {}).get('captures') or [] if purchase_units else []
    capture = captures[0] if captures else {}
    capture_id = capture.get('id')
    amount_data = capture.get('amount') or {}
    captured_amount = amount_data.get('value')
    captured_currency = amount_data.get('currency_code')
    return capture_id, captured_amount, captured_currency


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

        with transaction.atomic():
            intent = ListingPaymentIntent.objects.select_for_update().filter(
                pk=intent_id, user_id=request.user.pk, status='PENDING'
            ).first()
            if not intent:
                return Response({'detail': 'Pending listing payment intent not found.'}, status=404)
            if intent.expires_at is not None and intent.expires_at <= timezone.now():
                intent.status = 'EXPIRED'
                intent.updated_at = timezone.now()
                intent.save(update_fields=['status', 'updated_at'])
                return Response({'detail': 'Payment intent has expired.'}, status=409)

            existing_provider = (intent.provider or '').lower()
            existing_reference = (intent.provider_reference or '').strip()
            if existing_provider and existing_provider != provider_name:
                return Response({'detail': f'Payment intent is already initialized with {existing_provider}.'}, status=409)
            if existing_reference:
                return Response({
                    'success': True,
                    'already_started': True,
                    'payment_intent_id': str(intent.id),
                    'provider': existing_provider or provider_name,
                    'provider_reference': existing_reference,
                    'provider_amount': str(intent.provider_amount) if intent.provider_amount is not None else None,
                    'provider_currency': intent.provider_currency,
                    'paypal_fx_rate': str(intent.paypal_fx_rate) if intent.paypal_fx_rate else None,
                    'message': 'Payment request already started for this payment intent.',
                })

            profile = request.user
            if provider_name == 'mpesa':
                if not profile.phone:
                    return Response({'detail': 'Profile phone number required.'}, status=400)
                try:
                    phone_number = _normalize_kenyan_phone(profile.phone)
                except ValueError as exc:
                    return Response({'detail': str(exc)}, status=400)
                amount = intent.amount_kes
                currency = 'KES'
                fx_rate = None
            else:
                phone_number = None
                try:
                    fx_rate = get_exchange_rate('KES', 'USD')
                    amount = (intent.amount_kes * fx_rate).quantize(Decimal('0.01'))
                except Exception as exc:
                    return Response({'success': False, 'message': str(exc)}, status=503)
                currency = 'USD'

            result = get_provider(provider_name).create_payment(
                amount=amount, currency=currency, reference=str(intent.id),
                metadata={'phone_number': phone_number, 'description': 'SakaKrib listing'},
                request_id=str(intent.id) if provider_name == 'paypal' else None,
            )
            if not result.success:
                return Response({'success': False, 'message': result.message, 'provider_response': result.raw}, status=502)
            if not result.provider_reference:
                return Response({'success': False, 'message': 'Payment provider did not return a transaction reference.'}, status=502)

            intent.provider = provider_name.upper()
            intent.provider_reference = result.provider_reference
            intent.provider_amount = amount
            intent.provider_currency = currency
            intent.paypal_fx_rate = fx_rate
            if provider_name == 'paypal':
                intent.paypal_order_id = result.provider_reference
            intent.updated_at = timezone.now()
            update_fields = ['provider', 'provider_reference', 'provider_amount', 'provider_currency', 'paypal_fx_rate', 'updated_at']
            if provider_name == 'paypal':
                update_fields.append('paypal_order_id')
            intent.save(update_fields=update_fields)
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

        try:
            result_code_int = int(result_code) if result_code is not None else 1
        except (TypeError, ValueError):
            result_code_int = 1

        items = {item.get('Name'): item.get('Value') for item in callback.get('CallbackMetadata', {}).get('Item', [])}
        try:
            with transaction.atomic():
                intent = ListingPaymentIntent.objects.select_for_update().filter(
                    provider='MPESA', provider_reference=checkout_id, status='PENDING'
                ).first()
                if not intent:
                    return Response({'ResultCode': 0, 'ResultDesc': 'Accepted'})

                if result_code_int != 0:
                    intent.status = 'FAILED'
                    intent.updated_at = timezone.now()
                    intent.save(update_fields=['status', 'updated_at'])
                    return Response({'ResultCode': 0, 'ResultDesc': 'Accepted'})

                result = process_listing_payment(
                    intent.id, provider='MPESA', payment_method='MPESA', provider_reference=checkout_id,
                    provider_amount=items.get('Amount'), provider_currency='KES', checkout_request_id=checkout_id,
                    merchant_request_id=callback.get('MerchantRequestID'), mpesa_receipt=items.get('MpesaReceiptNumber'),
                    phone_number=items.get('PhoneNumber'), result_code=result_code_int,
                    result_description=callback.get('ResultDesc'),
                )
        except Exception as exc:
            return Response({'ResultCode': 1, 'ResultDesc': f'Settlement failed: {exc}'}, status=500)
        return Response({'ResultCode': 0, 'ResultDesc': 'Accepted', 'listing_id': str(result['listing_id'])})


class PayPalListingCaptureView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        intent_id = request.data.get('payment_intent_id')
        order_id = str(request.data.get('order_id') or '').strip()
        if not intent_id or not order_id:
            return Response({'detail': 'payment_intent_id and order_id are required.'}, status=400)

        intent = ListingPaymentIntent.objects.filter(pk=intent_id, user_id=request.user.pk).first()
        if not intent:
            return Response({'detail': 'Listing payment intent not found.'}, status=404)
        if intent.status == 'PAID':
            return Response({
                'success': True,
                'already_processed': True,
                'payment_intent_id': str(intent.id),
                'listing_id': str(intent.listing_id) if intent.listing_id else None,
                'status': 'PAID',
            })
        if intent.status != 'PENDING':
            return Response({'detail': 'Payment intent is not pending.'}, status=409)
        if intent.expires_at is not None and intent.expires_at <= timezone.now():
            intent.status = 'EXPIRED'
            intent.updated_at = timezone.now()
            intent.save(update_fields=['status', 'updated_at'])
            return Response({'detail': 'Payment intent has expired.'}, status=409)
        if intent.provider != 'PAYPAL' or intent.provider_reference != order_id or intent.paypal_order_id != order_id:
            return Response({'success': False, 'message': 'PayPal order does not match the payment intent.'}, status=400)
        if not intent.provider_amount or intent.provider_currency != 'USD' or not intent.paypal_fx_rate:
            return Response({'success': False, 'message': 'Payment intent has no valid server-side USD/FX settlement data.'}, status=400)

        provider = get_provider('paypal')
        try:
            order_result = provider.verify_payment(provider_reference=order_id)
            raw = order_result.raw or {}
            provider_status = raw.get('status')

            if provider_status == 'APPROVED':
                result = provider.capture_payment(order_id=order_id, request_id=str(intent.id))
                if not result.success:
                    return Response({'success': False, 'message': result.message, 'provider_response': result.raw}, status=402)
                raw = result.raw or {}
            elif provider_status != 'COMPLETED':
                return Response({'success': False, 'message': f'PayPal order is not capturable: {provider_status}'}, status=409)

            capture_id, captured_amount, captured_currency = _paypal_capture_details(raw)
            if not capture_id or captured_amount is None or captured_currency != 'USD':
                return Response({'success': False, 'message': 'PayPal order does not contain a valid USD capture.'}, status=409)

            with transaction.atomic():
                settled = process_listing_payment(
                    intent.id, provider='PAYPAL', payment_method='PAYPAL', provider_reference=capture_id,
                    provider_amount=captured_amount, provider_currency='USD',
                    paypal_order_id=order_id, paypal_fx_rate=intent.paypal_fx_rate,
                    paid_amount_kes=intent.amount_kes,
                    result_description=f'PayPal order {order_id} status {provider_status}',
                )
        except Exception as exc:
            return Response({'success': False, 'message': f'Payment provider verification/settlement failed: {exc}'}, status=500)

        return Response({**settled, 'payment_captured': True, 'provider_reference': capture_id,
                         'paypal_order_id': order_id, 'paypal_capture_id': capture_id})
