from datetime import timedelta
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.utils import timezone

from apps.core.domain_platform import PaymentWebhookEvent
from apps.core.payment_events import publish_payment_status

from .models import LandlordSubscription, RealEstateSubscription, SubscriptionInvoice, SubscriptionPlan
from .paypal_subscription_services import (
    _event_subscription_id,
    _next_billing_time,
    _paypal_json,
    _paypal_token,
    _subscription_for_paypal_id,
)


def confirm_paypal_subscription_upgrade(profile, invoice_id):
    """Confirm PayPal re-consent without changing the local entitlement.

    PayPal applies the revised recurring price on the next billing cycle. The
    pending upgrade invoice is therefore left pending until the recurring sale
    webhook confirms the payment.
    """
    subscription_model = LandlordSubscription if profile.role == 'landlord' else RealEstateSubscription
    owner_field = 'landlord_subscription_id' if profile.role == 'landlord' else 'real_estate_subscription_id'
    current = None
    if profile.role == 'landlord':
        current = LandlordSubscription.objects.filter(landlord_id=profile.id, status__in=['ACTIVE', 'GRACE_PERIOD']).order_by('-updated_at').first()
    elif profile.role == 'real_estate':
        current = RealEstateSubscription.objects.filter(real_estate_id=profile.id, status__in=['ACTIVE', 'GRACE_PERIOD']).order_by('-updated_at').first()
    if not current:
        raise ValueError('No active subscription is available for PayPal upgrade confirmation')

    with transaction.atomic():
        invoice = SubscriptionInvoice.objects.select_for_update().filter(
            pk=invoice_id,
            **{owner_field: current.id},
            status='PENDING',
            payment_provider='PAYPAL',
            upgrade_plan_id__isnull=False,
        ).first()
        if not invoice:
            raise ValueError('Pending PayPal subscription upgrade not found')

        subscription = subscription_model.objects.select_for_update().get(pk=current.id)
        target_plan = SubscriptionPlan.objects.select_for_update().filter(
            pk=invoice.upgrade_plan_id,
            audience=profile.role.upper(),
        ).first()
        if not target_plan:
            raise ValueError('Target subscription plan no longer exists')

        paypal_subscription_id = str(subscription.paypal_subscription_id or '').strip()
        if not paypal_subscription_id:
            raise ValueError('The subscription is not linked to PayPal')

        details = _paypal_json(
            f'/v1/billing/subscriptions/{paypal_subscription_id}',
            token=_paypal_token(),
        )
        expected_plan_id = target_plan.paypal_monthly_plan_id if invoice.upgrade_billing_cycle == 'MONTHLY' else target_plan.paypal_annual_plan_id
        if str(details.get('plan_id') or '').strip() != str(expected_plan_id or '').strip():
            raise ValueError('PayPal has not confirmed the requested subscription plan revision')
        if str(details.get('status') or '').upper() not in ('ACTIVE', 'SUSPENDED'):
            raise ValueError('PayPal subscription is not in a revisable state')

        invoice.result_description = f'PayPal upgrade to {target_plan.name} scheduled for the next billing cycle.'
        invoice.save(update_fields=['result_description'])
        owner_id = subscription.landlord_id if profile.role == 'landlord' else subscription.real_estate_id
        return {
            'success': True,
            'status': 'PENDING_PAYMENT',
            'upgrade': True,
            'upgrade_scheduled': True,
            'invoice_id': str(invoice.id),
            'subscription_id': str(subscription.id),
            'current_plan_id': str(subscription.plan_id),
            'target_plan_id': str(target_plan.id),
            'target_plan_name': target_plan.name,
            'billing_cycle': invoice.upgrade_billing_cycle or subscription.billing_cycle,
            'paypal_subscription_id': paypal_subscription_id,
            'next_billing_at': subscription.next_billing_at,
        }


def process_paypal_subscription_webhook(payload):
    """Handle upgrade recurring sales before delegating all other events.

    Existing PayPal webhook behavior remains authoritative for normal payments.
    Only a pending upgrade sale gets the special target-plan settlement needed to
    keep the local entitlement aligned with the provider's next-cycle billing.
    """
    event_type = str(payload.get('event_type') or '').strip()
    if event_type != 'PAYMENT.SALE.COMPLETED':
        from .paypal_subscription_services import process_paypal_subscription_webhook as process_existing
        return process_existing(payload)

    event_id = str(payload.get('id') or '').strip()
    if not event_id:
        raise ValueError('PayPal webhook event id and type are required')

    subscription_id = _event_subscription_id(payload)
    subscription, audience = _subscription_for_paypal_id(subscription_id)
    if subscription is None:
        from .paypal_subscription_services import process_paypal_subscription_webhook as process_existing
        return process_existing(payload)

    resource = payload.get('resource') or {}
    invoice = SubscriptionInvoice.objects.filter(
        paypal_subscription_id=subscription_id,
        status='PENDING',
        upgrade_plan_id__isnull=False,
    ).order_by('-created_at').first()
    if invoice is None:
        from .paypal_subscription_services import process_paypal_subscription_webhook as process_existing
        return process_existing(payload)

    with transaction.atomic():
        existing = PaymentWebhookEvent.objects.select_for_update().filter(
            provider='PAYPAL_SUBSCRIPTION', event_id=event_id
        ).first()
        if existing and existing.status == 'PROCESSED':
            return {'status': 'ALREADY_PROCESSED', 'event_id': event_id}
        if existing is None:
            existing = PaymentWebhookEvent.objects.create(
                provider='PAYPAL_SUBSCRIPTION',
                event_id=event_id,
                event_type=event_type,
                status='PROCESSING',
                metadata=payload,
            )
        else:
            existing.status = 'PROCESSING'
            existing.error = None
            existing.metadata = payload
            existing.save(update_fields=['status', 'error', 'metadata'])

        subscription_model = LandlordSubscription if audience == 'landlord' else RealEstateSubscription
        subscription = subscription_model.objects.select_for_update().get(pk=subscription.id)
        invoice = SubscriptionInvoice.objects.select_for_update().get(pk=invoice.id)
        target_plan = SubscriptionPlan.objects.select_for_update().filter(
            pk=invoice.upgrade_plan_id,
            audience='LANDLORD' if audience == 'landlord' else 'REAL_ESTATE',
        ).first()
        if not target_plan:
            raise ValueError('Target subscription plan no longer exists')

        amount_data = resource.get('amount') or {}
        try:
            paid_usd = Decimal(str(amount_data.get('total') or amount_data.get('value')))
        except (InvalidOperation, TypeError):
            raise ValueError('PayPal recurring payment amount is invalid')
        if paid_usd <= 0:
            raise ValueError('PayPal recurring payment amount must be positive')
        expected_usd = invoice.amount_usd
        if expected_usd is None:
            raise ValueError('PayPal upgrade invoice is missing its USD amount')
        if abs(paid_usd - expected_usd) > Decimal('0.01'):
            raise ValueError('PayPal upgrade payment amount does not match the upgrade invoice')

        now = timezone.now()
        sale_reference = str(resource.get('id') or subscription_id)
        billing_cycle = invoice.upgrade_billing_cycle or subscription.billing_cycle
        start = subscription.current_period_end or now
        if start < now:
            start = now

        # Prefer PayPal's next billing timestamp when it is present. If PayPal
        # does not provide it, calculate the period from the target billing cycle
        # rather than the subscription's old cycle (important for monthly→annual
        # and annual→monthly upgrades).
        end = _next_billing_time(resource)
        if not end or end <= start:
            end = start + (timedelta(days=365) if billing_cycle == 'ANNUAL' else timedelta(days=30))

        invoice.amount_usd = paid_usd
        invoice.currency = 'USD'
        invoice.provider_transaction_id = sale_reference
        invoice.provider_reference = subscription_id
        invoice.webhook_event_id = event_id
        invoice.result_description = str(payload.get('summary') or 'PayPal subscription upgrade payment completed')[:2000]
        invoice.status = 'PAID'
        invoice.paid_at = now
        invoice.billing_period_start = start
        invoice.billing_period_end = end
        invoice.save(update_fields=[
            'amount_usd', 'currency', 'provider_transaction_id', 'provider_reference',
            'webhook_event_id', 'result_description', 'status', 'paid_at',
            'billing_period_start', 'billing_period_end',
        ])

        subscription.plan_id = target_plan.id
        subscription.billing_cycle = billing_cycle
        subscription.billing_amount_kes = target_plan.annual_price_kes if billing_cycle == 'ANNUAL' else target_plan.monthly_price_kes
        subscription.billing_amount_usd = target_plan.paypal_annual_price_usd if billing_cycle == 'ANNUAL' else target_plan.paypal_monthly_price_usd
        subscription.paypal_plan_id = target_plan.paypal_monthly_plan_id if billing_cycle == 'MONTHLY' else target_plan.paypal_annual_plan_id
        subscription.status = 'ACTIVE'
        subscription.current_period_start = start
        subscription.current_period_end = end
        subscription.grace_period_end = None
        subscription.paypal_status = 'ACTIVE'
        subscription.auto_renew = not subscription.cancel_at_period_end
        subscription.next_billing_at = _next_billing_time(resource) or end
        subscription.updated_at = now
        subscription.save(update_fields=[
            'plan_id', 'billing_cycle', 'billing_amount_kes', 'billing_amount_usd',
            'paypal_plan_id', 'status', 'current_period_start', 'current_period_end',
            'grace_period_end', 'paypal_status', 'auto_renew', 'next_billing_at', 'updated_at',
        ])

        existing.status = 'PROCESSED'
        existing.processed_at = now
        existing.save(update_fields=['status', 'processed_at'])

        owner_id = subscription.landlord_id if audience == 'landlord' else subscription.real_estate_id
        transaction.on_commit(lambda: publish_payment_status(
            user_id=owner_id,
            invoice_id=invoice.id,
            status='UPGRADED',
            message=f'PayPal subscription upgrade to {target_plan.name} confirmed successfully.',
            provider='PAYPAL',
            event_type=event_type,
            listing_id=invoice.listing_id,
            subscription_id=subscription.id,
            subscription_status=subscription.status,
            details={
                'upgrade': True,
                'target_plan_id': str(target_plan.id),
                'target_plan_name': target_plan.name,
                'billing_cycle': billing_cycle,
                'provider_transaction_id': sale_reference,
            },
        ))

        return {
            'status': 'UPGRADED',
            'event_id': event_id,
            'event_type': event_type,
            'invoice_id': str(invoice.id),
            'subscription_id': str(subscription.id),
            'target_plan_id': str(target_plan.id),
            'target_plan_name': target_plan.name,
        }
