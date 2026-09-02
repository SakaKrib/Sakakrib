from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.payments.services import get_provider
from .models import LandlordSubscription, RealEstateSubscription, SubscriptionInvoice, SubscriptionPlan
from .paypal_subscription_services import (
    process_paypal_subscription_webhook,
    verify_and_finalize_initial_subscription,
    verify_paypal_webhook,
)
from .payment_services import create_subscription_checkout, finalize_mpesa_subscription
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
        profile = request.user
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
                         'grace_period_end': subscription.grace_period_end if subscription else None,
                         'auto_renew': subscription.auto_renew if subscription else False,
                         'paypal_subscription_id': subscription.paypal_subscription_id if subscription else None,
                         'paypal_status': subscription.paypal_status if subscription else None,
                         'next_billing_at': subscription.next_billing_at if subscription else None,
                         'cancel_at_period_end': subscription.cancel_at_period_end if subscription else False})


class MySubscriptionAccessView(APIView):
    def get(self, request):
        return Response(get_subscription_access(request.user))


class MySubscriptionInvoiceView(APIView):
    def get(self, request, invoice_id):
        invoice = SubscriptionInvoice.objects.filter(pk=invoice_id).first()
        if not invoice:
            return Response({'detail': 'Subscription invoice not found.'}, status=404)
        owned = str(invoice.landlord_subscription_id) == str(getattr(get_current_subscription(request.user), 'id', ''))
        if not owned:
            owned = LandlordSubscription.objects.filter(pk=invoice.landlord_subscription_id, landlord_id=request.user.id).exists() or RealEstateSubscription.objects.filter(pk=invoice.real_estate_subscription_id, real_estate_id=request.user.id).exists()
        if not owned:
            return Response({'detail': 'You are not authorized to view this invoice.'}, status=404)
        return Response({'id': str(invoice.id), 'status': invoice.status, 'amount_kes': invoice.amount_kes,
                         'payment_provider': invoice.payment_provider, 'provider_reference': invoice.provider_reference,
                         'checkout_request_id': invoice.checkout_request_id, 'merchant_request_id': invoice.merchant_request_id,
                         'mpesa_receipt': invoice.mpesa_receipt, 'paid_at': invoice.paid_at})


class SubscriptionCheckoutView(APIView):
    def post(self, request):
        try:
            phone_number = request.data.get('phone_number') or getattr(request.user, 'phone', None)
            result = create_subscription_checkout(
                profile=request.user, plan_id=request.data.get('plan_id'),
                billing_cycle=request.data.get('billing_cycle', 'MONTHLY'),
                provider=request.data.get('provider'), phone_number=phone_number)
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
        checkout_id = str(callback.get('CheckoutRequestID') or '').strip()
        callback_result_code = callback.get('ResultCode')
        if not checkout_id:
            return Response({'ResultCode': 0, 'ResultDesc': 'Accepted'})

        invoice = SubscriptionInvoice.objects.filter(
            checkout_request_id=checkout_id,
            payment_provider='MPESA',
        ).first()
        if not invoice:
            return Response({'ResultCode': 0, 'ResultDesc': 'Accepted'})

        items = {item.get('Name'): item.get('Value') for item in callback.get('CallbackMetadata', {}).get('Item', [])}
        try:
            provider_result = get_provider('mpesa').verify_payment(provider_reference=checkout_id)
            provider_raw = provider_result.raw or {}
            try:
                provider_result_code = int(provider_raw.get('ResultCode'))
            except (TypeError, ValueError):
                provider_result_code = None
            try:
                callback_code = int(callback_result_code) if callback_result_code is not None else None
            except (TypeError, ValueError):
                callback_code = None

            if provider_result_code is None or callback_code != provider_result_code:
                return Response({'ResultCode': 1, 'ResultDesc': 'Provider callback/result mismatch.'}, status=500)

            result = finalize_mpesa_subscription(
                invoice.id,
                provider_result_code,
                provider_raw.get('ResultDesc') or callback.get('ResultDesc', ''),
                mpesa_receipt=items.get('MpesaReceiptNumber'),
                checkout_request_id=checkout_id,
                merchant_request_id=callback.get('MerchantRequestID'),
                phone_number=items.get('PhoneNumber'),
                paid_amount=items.get('Amount'),
            )
        except Exception as exc:
            return Response({'ResultCode': 1, 'ResultDesc': f'Settlement failed: {exc}'}, status=500)
        return Response({'ResultCode': 0, 'ResultDesc': 'Accepted', **result})


class PayPalSubscriptionApproveView(APIView):
    def post(self, request):
        invoice_id = request.data.get('invoice_id')
        paypal_subscription_id = request.data.get('paypal_subscription_id')
        if not invoice_id or not paypal_subscription_id:
            return Response({'success': False, 'detail': 'invoice_id and paypal_subscription_id are required.'}, status=400)
        invoice = SubscriptionInvoice.objects.filter(pk=invoice_id, status='PENDING', payment_provider='PAYPAL').first()
        if not invoice:
            return Response({'success': False, 'detail': 'Pending PayPal subscription invoice not found.'}, status=404)
        owned = (
            LandlordSubscription.objects.filter(pk=invoice.landlord_subscription_id, landlord_id=request.user.id).exists()
            or RealEstateSubscription.objects.filter(pk=invoice.real_estate_subscription_id, real_estate_id=request.user.id).exists()
        )
        if not owned:
            return Response({'success': False, 'detail': 'You are not authorized to approve this subscription.'}, status=404)
        try:
            settled = verify_and_finalize_initial_subscription(invoice.id, paypal_subscription_id)
        except ValueError as exc:
            return Response({'success': False, 'detail': str(exc)}, status=400)
        except RuntimeError as exc:
            return Response({'success': False, 'detail': str(exc)}, status=502)
        return Response({**settled, 'payment_approved': True, 'paypal_subscription_id': paypal_subscription_id})


class PayPalSubscriptionWebhookView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        payload = request.data
        try:
            verify_paypal_webhook(payload, request.headers)
            result = process_paypal_subscription_webhook(payload)
        except ValueError as exc:
            return Response({'success': False, 'detail': str(exc)}, status=400)
        except RuntimeError as exc:
            return Response({'success': False, 'detail': str(exc)}, status=503)
        except Exception as exc:
            return Response({'success': False, 'detail': str(exc)}, status=500)
        return Response({'success': True, **result})
