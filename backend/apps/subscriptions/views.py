from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.payments.services import get_provider
from .models import SubscriptionInvoice, SubscriptionPlan
from .payment_services import (create_subscription_checkout, finalize_mpesa_subscription,
                               finalize_paypal_subscription)
from .services import get_current_subscription, get_subscription_access, get_subscription_plan


class SubscriptionPlansView(APIView):
    authentication_classes = []
    permission_classes = []

    def get(self, request):
        audience = request.query_params.get('audience', '').upper()
        queryset = SubscriptionPlan.objects.all().order_by('audience', 'monthly_price_kes')
        if audience in ('LANDLORD', 'REAL_ESTATE'):
            queryset = queryset.filter(audience=audience)
        return Response([{'id': plan.id, 'name': plan.name, 'audience': plan.audience,
                          'max_listings': plan.max_listings, 'max_units_per_listing': plan.max_units_per_listing,
                          'monthly_price_kes': plan.monthly_price_kes, 'annual_price_kes': plan.annual_price_kes,
                          'paypal_monthly_plan_id': plan.paypal_monthly_plan_id,
                          'paypal_annual_plan_id': plan.paypal_annual_plan_id} for plan in queryset])


class MySubscriptionView(APIView):
    def get(self, request):
        profile = request.user.profile
        subscription = get_current_subscription(profile)
        plan = get_subscription_plan(subscription)
        return Response({'subscription_id': subscription.id if subscription else None,
                         'plan_id': plan.id if plan else None, 'plan_name': plan.name if plan else None,
                         'subscription_status': subscription.status if subscription else None,
                         'billing_cycle': subscription.billing_cycle if subscription else None,
                         'max_listings': plan.max_listings if plan else None,
                         'max_units_per_listing': plan.max_units_per_listing if plan else None,
                         'current_period_start': subscription.current_period_start if subscription else None,
                         'current_period_end': subscription.current_period_end if subscription else None,
                         'grace_period_end': subscription.grace_period_end if subscription else None})


class MySubscriptionAccessView(APIView):
    def get(self, request):
        return Response(get_subscription_access(request.user.profile))


class SubscriptionCheckoutView(APIView):
    def post(self, request):
        try:
            result = create_subscription_checkout(
                profile=request.user.profile, plan_id=request.data.get('plan_id'),
                billing_cycle=request.data.get('billing_cycle', 'MONTHLY'),
                provider=request.data.get('provider'), phone_number=request.data.get('phone_number'))
        except ValueError as exc:
            return Response({'success': False, 'detail': str(exc)}, status=400)
        except RuntimeError as exc:
            return Response({'success': False, 'detail': str(exc)}, status=502)
        return Response(result)


class MpesaSubscriptionCallbackView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        callback = request.data.get('Body', {}).get('stkCallback', {})
        checkout_id = callback.get('CheckoutRequestID')
        result_code = callback.get('ResultCode')
        if not checkout_id:
            return Response({'ResultCode': 0, 'ResultDesc': 'Accepted'})
        invoice = SubscriptionInvoice.objects.filter(checkout_request_id=checkout_id).first()
        if not invoice:
            return Response({'ResultCode': 0, 'ResultDesc': 'Accepted'})
        items = {item.get('Name'): item.get('Value') for item in callback.get('CallbackMetadata', {}).get('Item', [])}
        try:
            result = finalize_mpesa_subscription(
                invoice.id, result_code, callback.get('ResultDesc', ''),
                mpesa_receipt=items.get('MpesaReceiptNumber'), checkout_request_id=checkout_id,
                merchant_request_id=callback.get('MerchantRequestID'), phone_number=items.get('PhoneNumber'),
                paid_amount=items.get('Amount'))
        except Exception as exc:
            return Response({'ResultCode': 1, 'ResultDesc': f'Settlement failed: {exc}'}, status=500)
        return Response({'ResultCode': 0, 'ResultDesc': 'Accepted', **result})


class PayPalSubscriptionCaptureView(APIView):
    def post(self, request):
        invoice_id = request.data.get('invoice_id')
        order_id = request.data.get('order_id')
        if not invoice_id or not order_id:
            return Response({'success': False, 'detail': 'invoice_id and order_id are required.'}, status=400)
        invoice = SubscriptionInvoice.objects.filter(pk=invoice_id).first()
        if not invoice or invoice.status != 'PENDING':
            return Response({'success': False, 'detail': 'Pending subscription invoice not found.'}, status=404)
        if invoice.payment_provider != 'PAYPAL' or invoice.provider_reference != order_id:
            return Response({'success': False, 'detail': 'PayPal order does not match invoice.'}, status=400)
        try:
            result = get_provider('paypal').verify_payment(provider_reference=order_id)
            settled = finalize_paypal_subscription(invoice.id, order_id, result)
        except Exception as exc:
            return Response({'success': False, 'detail': str(exc)}, status=502)
        return Response({**settled, 'payment_captured': True, 'provider_reference': order_id})
