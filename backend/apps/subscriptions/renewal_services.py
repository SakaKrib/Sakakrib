from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from apps.payments.services import get_provider

from .models import LandlordSubscription, RealEstateSubscription, SubscriptionInvoice
from .services import get_current_subscription


def create_mpesa_subscription_renewal(profile, phone_number=None):
    """Create a payment against the existing subscription without creating a new subscription.

    ACTIVE subscriptions are renewed from their existing period end. GRACE_PERIOD
    subscriptions resume immediately after successful payment. Existing PMS listing
    links remain attached to the same subscription record.
    """
    if profile.role not in ('landlord', 'real_estate'):
        raise ValueError('Only landlord and real estate accounts can renew subscriptions')
    if profile.verification_status != 'verified':
        raise ValueError('Identity verification is required before subscription renewal')
    if not getattr(profile, 'email_verified', False):
        raise ValueError('Email verification is required before subscription renewal')
    if profile.role == 'landlord' and profile.landlord_application_status != 'approved':
        raise ValueError('Landlord application approval is required before subscription renewal')
    if profile.role == 'real_estate' and profile.real_estate_application_status != 'approved':
        raise ValueError('Real estate application approval is required before subscription renewal')
    if not phone_number:
        raise ValueError('phone_number is required for M-Pesa')

    subscription = get_current_subscription(profile)
    if not subscription or subscription.status not in ('ACTIVE', 'GRACE_PERIOD'):
        raise ValueError('No active or grace-period subscription is available for renewal')

    amount_kes = Decimal(str(subscription.billing_amount_kes or '0'))
    if amount_kes <= 0:
        raise ValueError('Subscription billing amount is not configured')

    subscription_id = subscription.id
    owner_field = 'landlord_subscription_id' if profile.role == 'landlord' else 'real_estate_subscription_id'
    now = timezone.now()

    with transaction.atomic():
        subscription_model = LandlordSubscription if profile.role == 'landlord' else RealEstateSubscription
        locked = subscription_model.objects.select_for_update().get(pk=subscription_id)
        if locked.status not in ('ACTIVE', 'GRACE_PERIOD'):
            raise ValueError('Subscription is no longer available for renewal')

        pending = SubscriptionInvoice.objects.filter(**{owner_field: locked.id}, status='PENDING').order_by('-created_at').first()
        if pending:
            raise ValueError('A subscription renewal payment is already pending')

        invoice = SubscriptionInvoice.objects.create(
            amount_kes=amount_kes,
            status='PENDING',
            payment_provider='MPESA',
            payment_method='MPESA',
            phone_number=phone_number,
            landlord_subscription_id=locked.id if profile.role == 'landlord' else None,
            real_estate_subscription_id=locked.id if profile.role == 'real_estate' else None,
            currency='KES',
            billing_period_start=locked.current_period_end if locked.status == 'ACTIVE' else now,
            pricing_snapshot_source='subscription_billing_amount',
        )

    result = get_provider('mpesa').create_payment(
        amount=amount_kes,
        currency='KES',
        reference=str(invoice.id),
        metadata={
            'phone_number': phone_number,
            'description': 'SakaKrib subscription renewal',
            'callback_url': __import__('django.conf', fromlist=['settings']).settings.MPESA_SUBSCRIPTION_CALLBACK_URL,
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
        'subscription_id': str(subscription_id),
        'invoice_id': str(invoice.id),
        'provider': 'mpesa',
        'billing_cycle': subscription.billing_cycle,
        'plan_id': str(subscription.plan_id),
        'amount_kes': amount_kes,
        'provider_reference': result.provider_reference,
        'provider_response': result.raw,
        'status': 'PENDING_PAYMENT',
        'renewal': True,
    }
