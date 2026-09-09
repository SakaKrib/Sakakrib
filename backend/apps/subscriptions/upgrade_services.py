from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.core.payment_events import publish_payment_status
from apps.payments.services import get_provider

from .models import (
    LandlordSubscription,
    RealEstateSubscription,
    SubscriptionInvoice,
    SubscriptionListing,
    SubscriptionPlan,
)
from .services import get_current_subscription


_PLAN_RANK = {
    'STARTER': 1,
    'GROWTH': 2,
    'PRO': 3,
    'ENTERPRISE': 4,
}


def create_mpesa_subscription_upgrade(profile, target_plan_id, billing_cycle, phone_number=None):
    """Create an M-Pesa payment for an immediate PMS plan upgrade.

    Active subscriptions are upgraded immediately after successful payment and
    keep their existing paid period end. The charge is the price difference for
    the current billing cycle. A grace-period upgrade is treated as a restart at
    the target plan and charges the target plan's full cycle price. The existing
    subscription row and its PMS listing links are preserved.
    """
    if profile.role not in ('landlord', 'real_estate'):
        raise ValueError('Only landlord and real estate accounts can upgrade subscriptions')
    if profile.verification_status != 'verified':
        raise ValueError('Identity verification is required before subscription upgrade')
    if not getattr(profile, 'email_verified', False):
        raise ValueError('Email verification is required before subscription upgrade')
    if profile.role == 'landlord' and profile.landlord_application_status != 'approved':
        raise ValueError('Landlord application approval is required before subscription upgrade')
    if profile.role == 'real_estate' and profile.real_estate_application_status != 'approved':
        raise ValueError('Real estate application approval is required before subscription upgrade')
    if not phone_number:
        raise ValueError('phone_number is required for M-Pesa')

    billing_cycle = str(billing_cycle or '').upper()
    if billing_cycle not in ('MONTHLY', 'ANNUAL'):
        raise ValueError('billing_cycle must be MONTHLY or ANNUAL')

    current = get_current_subscription(profile)
    if not current or current.status not in ('ACTIVE', 'GRACE_PERIOD'):
        raise ValueError('No active or grace-period subscription is available for upgrade')
    if current.billing_cycle != billing_cycle:
        raise ValueError('Subscription upgrades must keep the current billing cycle')
    if getattr(current, 'paypal_subscription_id', None):
        raise ValueError('PayPal subscription upgrades are not available yet. Use the existing renewal flow or contact support.')

    current_plan = SubscriptionPlan.objects.filter(pk=current.plan_id, audience=profile.role.upper()).first()
    target_plan = SubscriptionPlan.objects.filter(pk=target_plan_id, audience=profile.role.upper()).first()
    if not current_plan or not target_plan:
        raise ValueError('Subscription plan not found for this account type')

    current_rank = _PLAN_RANK.get(str(current_plan.name).upper(), 0)
    target_rank = _PLAN_RANK.get(str(target_plan.name).upper(), 0)
    if target_rank <= current_rank:
        raise ValueError('The selected plan must be higher than your current plan')

    owner_field = 'landlord_subscription_id' if profile.role == 'landlord' else 'real_estate_subscription_id'
    subscription_model = LandlordSubscription if profile.role == 'landlord' else RealEstateSubscription
    now = timezone.now()

    with transaction.atomic():
        locked = subscription_model.objects.select_for_update().get(pk=current.id)
        if locked.status not in ('ACTIVE', 'GRACE_PERIOD'):
            raise ValueError('Subscription is no longer available for upgrade')
        if getattr(locked, 'paypal_subscription_id', None):
            raise ValueError('PayPal subscription upgrades are not available yet. Use the existing renewal flow or contact support.')

        current_plan = SubscriptionPlan.objects.filter(pk=locked.plan_id, audience=profile.role.upper()).first()
        target_plan = SubscriptionPlan.objects.filter(pk=target_plan_id, audience=profile.role.upper()).first()
        if not current_plan or not target_plan:
            raise ValueError('Subscription plan not found for this account type')
        if _PLAN_RANK.get(str(target_plan.name).upper(), 0) <= _PLAN_RANK.get(str(current_plan.name).upper(), 0):
            raise ValueError('The selected plan must be higher than your current plan')

        active_links = SubscriptionListing.objects.filter(
            Q(subscription_id=locked.id) | Q(real_estate_subscription_id=locked.id),
            status='ACTIVE',
        ).count()
        if target_plan.max_listings is not None and active_links > target_plan.max_listings:
            raise ValueError('The selected plan cannot support all existing PMS listings')

        current_amount = current_plan.annual_price_kes if billing_cycle == 'ANNUAL' else current_plan.monthly_price_kes
        target_amount = target_plan.annual_price_kes if billing_cycle == 'ANNUAL' else target_plan.monthly_price_kes
        if locked.status == 'ACTIVE':
            amount_kes = Decimal(target_amount) - Decimal(current_amount)
        else:
            amount_kes = Decimal(target_amount)
        if amount_kes <= 0:
            raise ValueError('The selected plan does not require a positive upgrade payment')

        pending = SubscriptionInvoice.objects.filter(**{owner_field: locked.id}, status='PENDING').order_by('-created_at').first()
        if pending:
            raise ValueError('A subscription payment is already pending')

        invoice = SubscriptionInvoice.objects.create(
            amount_kes=amount_kes,
            status='PENDING',
            payment_provider='MPESA',
            payment_method='MPESA',
            phone_number=phone_number,
            landlord_subscription_id=locked.id if profile.role == 'landlord' else None,
            real_estate_subscription_id=locked.id if profile.role == 'real_estate' else None,
            currency='KES',
            billing_period_start=locked.current_period_start if locked.status == 'ACTIVE' else now,
            billing_period_end=locked.current_period_end if locked.status == 'ACTIVE' else None,
            pricing_snapshot_source='subscription_upgrade',
            upgrade_plan_id=target_plan.id,
            upgrade_billing_cycle=billing_cycle,
        )

    result = get_provider('mpesa').create_payment(
        amount=amount_kes,
        currency='KES',
        reference=str(invoice.id),
        metadata={
            'phone_number': phone_number,
            'description': f'SakaKrib PMS subscription upgrade to {target_plan.name}',
            'callback_url': settings.MPESA_SUBSCRIPTION_CALLBACK_URL,
        },
    )
    if not result.success:
        invoice.status = 'FAILED'
        invoice.result_description = result.message
        invoice.save(update_fields=['status', 'result_description'])
        raise RuntimeError(result.message)

    invoice.provider_reference = result.provider_reference
    invoice.checkout_request_id = result.provider_reference
    invoice.save(update_fields=['provider_reference', 'checkout_request_id'])
    return {
        'success': True,
        'subscription_id': str(current.id),
        'invoice_id': str(invoice.id),
        'provider': 'mpesa',
        'billing_cycle': billing_cycle,
        'current_plan_id': str(current_plan.id),
        'current_plan_name': current_plan.name,
        'target_plan_id': str(target_plan.id),
        'target_plan_name': target_plan.name,
        'amount_kes': amount_kes,
        'provider_reference': result.provider_reference,
        'provider_response': result.raw,
        'status': 'PENDING_PAYMENT',
        'upgrade': True,
    }


def finalize_mpesa_subscription_upgrade(invoice_id, result_code, result_description='', mpesa_receipt=None, checkout_request_id=None, merchant_request_id=None, phone_number=None, paid_amount=None):
    with transaction.atomic():
        invoice = SubscriptionInvoice.objects.select_for_update().filter(pk=invoice_id).first()
        if not invoice:
            return {'success': True, 'already_settled': True}
        if invoice.status == 'PAID':
            return {
                'success': True,
                'already_settled': True,
                'subscription_id': str(invoice.landlord_subscription_id or invoice.real_estate_subscription_id),
            }
        if not invoice.upgrade_plan_id:
            raise ValueError('Invoice is not a subscription upgrade invoice')
        if invoice.payment_provider != 'MPESA':
            raise ValueError('Upgrade invoice is not an M-Pesa invoice')

        result_code_int = int(result_code) if result_code is not None else None
        invoice.result_code = result_code_int
        invoice.result_description = result_description
        invoice.checkout_request_id = checkout_request_id or invoice.checkout_request_id
        invoice.merchant_request_id = merchant_request_id
        invoice.phone_number = phone_number or invoice.phone_number
        invoice.mpesa_receipt = mpesa_receipt

        subscription = (
            LandlordSubscription.objects.select_for_update().get(pk=invoice.landlord_subscription_id)
            if invoice.landlord_subscription_id
            else RealEstateSubscription.objects.select_for_update().get(pk=invoice.real_estate_subscription_id)
            if invoice.real_estate_subscription_id
            else None
        )
        if subscription is None:
            raise ValueError('Upgrade invoice is not linked to a subscription')

        owner_id = getattr(subscription, 'landlord_id', None) or getattr(subscription, 'real_estate_id', None)
        subscription_id = subscription.id

        if result_code_int != 0:
            invoice.status = 'FAILED'
            invoice.save(update_fields=['result_code', 'result_description', 'checkout_request_id', 'merchant_request_id', 'phone_number', 'mpesa_receipt', 'status'])
            transaction.on_commit(lambda: publish_payment_status(
                user_id=owner_id,
                invoice_id=invoice.id,
                status='FAILED',
                message=result_description or 'M-Pesa upgrade payment failed.',
                provider='MPESA',
                event_type='MPESA.STK.CALLBACK.FAILED',
                listing_id=None,
                subscription_id=subscription_id,
                subscription_status=subscription.status,
                details={'result_code': result_code_int, 'upgrade': True},
            ))
            return {'success': False, 'status': 'FAILED'}

        if result_code_int is None:
            raise ValueError('M-Pesa result code is required')
        if not mpesa_receipt:
            raise ValueError('M-Pesa receipt is required for successful settlement')
        reference = (checkout_request_id or invoice.provider_reference or '').strip()
        if not reference:
            raise ValueError('M-Pesa provider reference is required for successful settlement')
        if paid_amount is None:
            raise ValueError('M-Pesa paid amount is required for successful settlement')
        if Decimal(str(paid_amount)) != invoice.amount_kes:
            raise ValueError('M-Pesa paid amount does not match invoice amount')

        target_plan = SubscriptionPlan.objects.select_for_update().filter(
            pk=invoice.upgrade_plan_id,
            audience='LANDLORD' if invoice.landlord_subscription_id else 'REAL_ESTATE',
        ).first()
        if not target_plan:
            raise ValueError('Target subscription plan no longer exists')

        now = timezone.now()
        if subscription.status == 'ACTIVE' and subscription.current_period_end and subscription.current_period_end > now:
            start = subscription.current_period_start
            end = subscription.current_period_end
        else:
            start = now
            end = start + timezone.timedelta(days=365 if invoice.upgrade_billing_cycle == 'ANNUAL' else 30)

        invoice.status = 'PAID'
        invoice.payment_provider = 'MPESA'
        invoice.payment_method = 'MPESA'
        invoice.provider_reference = reference
        invoice.provider_transaction_id = mpesa_receipt
        invoice.paid_at = now
        invoice.billing_period_start = start
        invoice.billing_period_end = end
        invoice.save(update_fields=['result_code', 'result_description', 'checkout_request_id', 'merchant_request_id', 'phone_number', 'mpesa_receipt', 'status', 'payment_provider', 'payment_method', 'provider_reference', 'provider_transaction_id', 'paid_at', 'billing_period_start', 'billing_period_end'])

        billing_cycle = invoice.upgrade_billing_cycle or subscription.billing_cycle
        billing_amount_kes = target_plan.annual_price_kes if billing_cycle == 'ANNUAL' else target_plan.monthly_price_kes
        subscription.plan_id = target_plan.id
        subscription.billing_cycle = billing_cycle
        subscription.billing_amount_kes = billing_amount_kes
        subscription.billing_amount_usd = target_plan.paypal_annual_price_usd if billing_cycle == 'ANNUAL' else target_plan.paypal_monthly_price_usd
        subscription.status = 'ACTIVE'
        subscription.current_period_start = start
        subscription.current_period_end = end
        subscription.grace_period_end = None
        subscription.updated_at = now
        subscription.save(update_fields=['plan_id', 'billing_cycle', 'billing_amount_kes', 'billing_amount_usd', 'status', 'current_period_start', 'current_period_end', 'grace_period_end', 'updated_at'])

        transaction.on_commit(lambda: publish_payment_status(
            user_id=owner_id,
            invoice_id=invoice.id,
            status='PAID',
            message=f'M-Pesa subscription upgrade to {target_plan.name} confirmed successfully.',
            provider='MPESA',
            event_type='MPESA.STK.CALLBACK.SUCCESS',
            listing_id=None,
            subscription_id=subscription_id,
            subscription_status='ACTIVE',
            details={'mpesa_receipt': mpesa_receipt, 'upgrade': True, 'target_plan_id': str(target_plan.id)},
        ))
        return {
            'success': True,
            'status': 'PAID',
            'subscription_id': str(subscription.id),
            'target_plan_id': str(target_plan.id),
            'target_plan_name': target_plan.name,
        }
