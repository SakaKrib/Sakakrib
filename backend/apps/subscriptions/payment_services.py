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

    amount_kes = plan.annual_price_kes if billing_cycle == 'ANNUAL' else plan.monthly_price_kes
    amount_usd = plan.paypal_annual_price_usd if billing_cycle == 'ANNUAL' else plan.paypal_monthly_price_usd
    now = timezone.now()
    period_end = _period_end(now, billing_cycle)

    with transaction.atomic():
        if profile.role == 'landlord':
            subscription = LandlordSubscription.objects.create(
                landlord_id=profile.id, plan_id=plan.id, billing_cycle=billing_cycle,
                status='PENDING_PAYMENT', current_period_start=now, current_period_end=period_end,
                billing_amount_kes=amount_kes, billing_amount_usd=amount_usd,
            )
        else:
            subscription = RealEstateSubscription.objects.create(
                real_estate_id=profile.id, plan_id=plan.id, billing_cycle=billing_cycle,
                status='PENDING_PAYMENT', current_period_start=now, current_period_end=period_end,
                billing_amount_kes=amount_kes, billing_amount_usd=amount_usd,
            )
        invoice = SubscriptionInvoice.objects.create(
            amount_kes=amount_kes, status='PENDING', payment_provider=provider.upper(),
            payment_method=provider.upper(), phone_number=phone_number,
            landlord_subscription_id=subscription.id if profile.role == 'landlord' else None,
            real_estate_subscription_id=subscription.id if profile.role == 'real_estate' else None,
            currency='KES' if provider == 'mpesa' else 'USD', amount_usd=amount_usd,
            billing_period_start=now, billing_period_end=period_end,
            pricing_snapshot_source='subscription_plans',
        )

    if provider == 'mpesa':
        if not phone_number:
            raise ValueError('phone_number is required for M-Pesa')
        result = get_provider('mpesa').create_payment(
            amount=Decimal(amount_kes), currency='KES', reference=str(invoice.id),
            metadata={'phone_number': phone_number, 'description': 'SakaKrib subscription'},
        )
    else:
        if amount_usd is None:
            raise ValueError('PayPal USD price is not configured for this plan and billing cycle')
        result = get_provider('paypal').create_payment(
            amount=Decimal(amount_usd), currency='USD', reference=str(invoice.id), metadata={},
        )

    if not result.success:
        invoice.status = 'FAILED'
        invoice.result_description = result.message
        invoice.save(update_fields=['status', 'result_description'])
        raise RuntimeError(result.message)

    invoice.provider_reference = result.provider_reference
    invoice.checkout_request_id = result.provider_reference if provider == 'mpesa' else None
    invoice.save(update_fields=['provider_reference', 'checkout_request_id'])
    return {
        'success': True, 'subscription_id': str(subscription.id), 'invoice_id': str(invoice.id),
        'provider': provider, 'billing_cycle': billing_cycle, 'plan_id': str(plan.id),
        'plan_name': plan.name, 'amount_kes': amount_kes, 'amount_usd': amount_usd,
        'provider_reference': result.provider_reference, 'provider_response': result.raw,
        'status': 'PENDING',
    }


def finalize_mpesa_subscription(invoice_id, result_code, result_description='', mpesa_receipt=None,
                                checkout_request_id=None, merchant_request_id=None, phone_number=None,
                                paid_amount=None):
    with transaction.atomic():
        invoice = SubscriptionInvoice.objects.select_for_update().filter(pk=invoice_id).first()
        if not invoice:
            return {'success': True, 'already_settled': True}
        if invoice.status == 'PAID':
            return {'success': True, 'already_settled': True, 'subscription_id': str(invoice.landlord_subscription_id or invoice.real_estate_subscription_id)}

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

        now = timezone.now()
        invoice.status = 'PAID'
        invoice.payment_provider = 'MPESA'
        invoice.payment_method = 'MPESA'
        invoice.paid_at = now
        invoice.provider_reference = invoice.checkout_request_id
        invoice.provider_transaction_id = mpesa_receipt
        invoice.save(update_fields=['result_code','result_description','checkout_request_id','merchant_request_id','phone_number','mpesa_receipt','status','payment_provider','payment_method','paid_at','provider_reference','provider_transaction_id'])

        if invoice.landlord_subscription_id:
            LandlordSubscription.objects.filter(pk=invoice.landlord_subscription_id).update(
                status='ACTIVE', current_period_start=invoice.billing_period_start or now,
                current_period_end=invoice.billing_period_end or now,
                grace_period_end=None, updated_at=now,
            )
            sid = invoice.landlord_subscription_id
        else:
            RealEstateSubscription.objects.filter(pk=invoice.real_estate_subscription_id).update(
                status='ACTIVE', current_period_start=invoice.billing_period_start or now,
                current_period_end=invoice.billing_period_end or now,
                grace_period_end=None, updated_at=now,
            )
            sid = invoice.real_estate_subscription_id
        return {'success': True, 'status': 'PAID', 'subscription_id': str(sid)}
