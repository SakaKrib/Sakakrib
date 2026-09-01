from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from apps.payments.services import get_provider
from .models import LandlordSubscription, RealEstateSubscription, SubscriptionInvoice, SubscriptionPlan


def _period_end(start, billing_cycle):
    return start + (timedelta(days=365) if billing_cycle == 'ANNUAL' else timedelta(days=30))


def create_subscription_checkout(profile, plan_id, billing_cycle, provider, phone_number=None):
    billing_cycle = str(billing_cycle or 'MONTHLY').upper()
    provider = str(provider or '').lower()
    if billing_cycle not in ('MONTHLY', 'ANNUAL'):
        raise ValueError('billing_cycle must be MONTHLY or ANNUAL')
    if provider not in ('mpesa', 'paypal'):
        raise ValueError('provider must be mpesa or paypal')
    if profile.role not in ('landlord', 'real_estate'):
        raise ValueError('Only landlord and real estate accounts can subscribe')
    if profile.verification_status != 'verified':
        raise ValueError('Identity verification is required before subscription checkout')
    if profile.role == 'landlord' and profile.landlord_application_status != 'approved':
        raise ValueError('Landlord application approval is required before subscription checkout')
    plan = SubscriptionPlan.objects.filter(pk=plan_id, audience=profile.role.upper()).first()
    if not plan:
        raise ValueError('Subscription plan not found for this account type')
    paypal_plan_id = plan.paypal_monthly_plan_id if billing_cycle == 'MONTHLY' else plan.paypal_annual_plan_id
    if provider == 'paypal' and not paypal_plan_id:
        raise ValueError('PayPal is not configured for this plan yet')
    subscription_model = LandlordSubscription if profile.role == 'landlord' else RealEstateSubscription
    owner_field = 'landlord_id' if profile.role == 'landlord' else 'real_estate_id'
    if subscription_model.objects.filter(**{owner_field: profile.id}, status__in=('ACTIVE', 'GRACE_PERIOD')).exists():
        raise ValueError('You already have an active subscription. Use the upgrade or renewal flow.')
    amount_kes = plan.annual_price_kes if billing_cycle == 'ANNUAL' else plan.monthly_price_kes
    amount_usd = plan.paypal_annual_price_usd if billing_cycle == 'ANNUAL' else plan.paypal_monthly_price_usd
    now = timezone.now()
    with transaction.atomic():
        subscription_model.objects.filter(**{owner_field: profile.id}, status='PENDING_PAYMENT').update(status='CANCELLED', updated_at=now)
        subscription = subscription_model.objects.create(
            **{owner_field: profile.id}, plan_id=plan.id, billing_cycle=billing_cycle,
            status='PENDING_PAYMENT', current_period_start=None, current_period_end=None,
            grace_period_end=None, auto_renew=False, billing_amount_kes=amount_kes,
            billing_amount_usd=amount_usd, paypal_plan_id=paypal_plan_id if provider == 'paypal' else None)
        invoice = SubscriptionInvoice.objects.create(
            amount_kes=amount_kes, status='PENDING', payment_provider=provider.upper(),
            payment_method=provider.upper(), phone_number=phone_number,
            landlord_subscription_id=subscription.id if profile.role == 'landlord' else None,
            real_estate_subscription_id=subscription.id if profile.role == 'real_estate' else None,
            currency='KES' if provider == 'mpesa' else 'USD', amount_usd=amount_usd,
            billing_period_start=None, billing_period_end=None, pricing_snapshot_source='subscription_plans')
    if provider == 'paypal':
        return {'success': True, 'subscription_id': str(subscription.id), 'invoice_id': str(invoice.id),
                'provider': 'paypal', 'billing_cycle': billing_cycle, 'plan_id': str(plan.id),
                'plan_name': plan.name, 'paypal_plan_id': paypal_plan_id,
                'status': 'PENDING_PAYMENT', 'payment_action': 'PAYPAL_SUBSCRIPTION_APPROVAL'}
    if not phone_number:
        raise ValueError('phone_number is required for M-Pesa')
    result = get_provider('mpesa').create_payment(
        amount=Decimal(amount_kes), currency='KES', reference=str(invoice.id),
        metadata={'phone_number': phone_number, 'description': 'SakaKrib subscription'})
    if not result.success:
        invoice.status = 'FAILED'
        invoice.result_description = result.message
        invoice.save(update_fields=['status', 'result_description'])
        raise RuntimeError(result.message)
    invoice.provider_reference = result.provider_reference
    invoice.checkout_request_id = result.provider_reference
    invoice.save(update_fields=['provider_reference', 'checkout_request_id'])
    return {'success': True, 'subscription_id': str(subscription.id), 'invoice_id': str(invoice.id),
            'provider': 'mpesa', 'billing_cycle': billing_cycle, 'plan_id': str(plan.id),
            'plan_name': plan.name, 'amount_kes': amount_kes, 'amount_usd': amount_usd,
            'provider_reference': result.provider_reference, 'provider_response': result.raw,
            'status': 'PENDING_PAYMENT'}


def finalize_mpesa_subscription(invoice_id, result_code, result_description='', mpesa_receipt=None,
                                checkout_request_id=None, merchant_request_id=None, phone_number=None, paid_amount=None):
    with transaction.atomic():
        invoice = SubscriptionInvoice.objects.select_for_update().filter(pk=invoice_id).first()
        if not invoice:
            return {'success': True, 'already_settled': True}
        if invoice.status == 'PAID':
            return {'success': True, 'already_settled': True,
                    'subscription_id': str(invoice.landlord_subscription_id or invoice.real_estate_subscription_id)}
        invoice.result_code = int(result_code or 0)
        invoice.result_description = result_description
        invoice.checkout_request_id = checkout_request_id or invoice.checkout_request_id
        invoice.merchant_request_id = merchant_request_id
        invoice.phone_number = phone_number or invoice.phone_number
        invoice.mpesa_receipt = mpesa_receipt
        if int(result_code or 1) != 0:
            invoice.status = 'FAILED'
            invoice.save(update_fields=['result_code','result_description','checkout_request_id','merchant_request_id','phone_number','mpesa_receipt','status'])
            if invoice.landlord_subscription_id:
                LandlordSubscription.objects.filter(pk=invoice.landlord_subscription_id, status='PENDING_PAYMENT').update(status='CANCELLED', updated_at=timezone.now())
            if invoice.real_estate_subscription_id:
                RealEstateSubscription.objects.filter(pk=invoice.real_estate_subscription_id, status='PENDING_PAYMENT').update(status='CANCELLED', updated_at=timezone.now())
            return {'success': False, 'status': 'FAILED'}
        if paid_amount is not None and Decimal(str(paid_amount)) != invoice.amount_kes:
            raise ValueError('M-Pesa paid amount does not match invoice amount')
        return _activate_invoice(invoice, provider='MPESA', provider_reference=checkout_request_id or invoice.provider_reference, transaction_id=mpesa_receipt)


def finalize_paypal_subscription(invoice_id, subscription_id):
    with transaction.atomic():
        invoice = SubscriptionInvoice.objects.select_for_update().filter(pk=invoice_id).first()
        if not invoice:
            raise ValueError('Subscription invoice not found')
        if invoice.status == 'PAID':
            return {'success': True, 'already_settled': True,
                    'subscription_id': str(invoice.landlord_subscription_id or invoice.real_estate_subscription_id)}
        if invoice.payment_provider != 'PAYPAL':
            raise ValueError('Invoice is not a PayPal invoice')
        if not subscription_id:
            raise ValueError('PayPal subscription ID is required')
        invoice.paypal_subscription_id = subscription_id
        invoice.provider_reference = subscription_id
        invoice.status = 'PAID'
        invoice.payment_method = 'PAYPAL'
        invoice.paid_at = timezone.now()
        invoice.save(update_fields=['paypal_subscription_id','provider_reference','status','payment_method','paid_at'])
        return _activate_invoice(invoice, provider='PAYPAL', provider_reference=subscription_id, transaction_id=subscription_id)


def _activate_invoice(invoice, provider, provider_reference, transaction_id=None):
    now = timezone.now()
    if invoice.landlord_subscription_id:
        subscription = LandlordSubscription.objects.select_for_update().get(pk=invoice.landlord_subscription_id)
    else:
        subscription = RealEstateSubscription.objects.select_for_update().get(pk=invoice.real_estate_subscription_id)
    start = now
    end = _period_end(start, subscription.billing_cycle)
    invoice.status = 'PAID'
    invoice.payment_provider = provider
    invoice.payment_method = provider
    invoice.provider_reference = provider_reference
    invoice.provider_transaction_id = transaction_id
    invoice.paid_at = now
    invoice.billing_period_start = start
    invoice.billing_period_end = end
    invoice.save(update_fields=['status','payment_provider','payment_method','provider_reference','provider_transaction_id','paid_at','billing_period_start','billing_period_end'])
    subscription.status = 'ACTIVE'
    subscription.current_period_start = start
    subscription.current_period_end = end
    subscription.grace_period_end = None
    if provider == 'PAYPAL':
        subscription.paypal_subscription_id = provider_reference
        subscription.paypal_status = 'ACTIVE'
        subscription.next_billing_at = end
    subscription.updated_at = now
    subscription.save(update_fields=['status','current_period_start','current_period_end','grace_period_end','paypal_subscription_id','paypal_status','next_billing_at','updated_at'])
    return {'success': True, 'status': 'PAID', 'subscription_id': str(subscription.id)}
