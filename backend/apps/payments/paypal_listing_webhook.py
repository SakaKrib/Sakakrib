from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.utils import timezone

from apps.core.domain_platform import PaymentWebhookEvent
from apps.core.payment_events import publish_payment_status
from apps.listings.models import ListingPaymentIntent
from apps.listings.payment_services import process_listing_payment
from apps.subscriptions.paypal_subscription_services import verify_paypal_webhook


def _order_id(payload):
    resource = payload.get('resource') or {}
    related = (resource.get('supplementary_data') or {}).get('related_ids') or {}
    return str(
        resource.get('custom_id')
        or related.get('order_id')
        or resource.get('order_id')
        or ''
    ).strip()


def _capture_amount(resource):
    amount = resource.get('amount') or {}
    try:
        value = Decimal(str(amount.get('value')))
    except (InvalidOperation, TypeError, ValueError):
        raise ValueError('PayPal capture amount is invalid')
    currency = str(amount.get('currency_code') or '').upper().strip()
    if value <= 0 or currency != 'USD':
        raise ValueError('PayPal capture must contain a positive USD amount')
    return value, currency


def process_paypal_listing_webhook(payload):
    event_id = str(payload.get('id') or '').strip()
    event_type = str(payload.get('event_type') or '').strip()
    supported = {
        'CHECKOUT.ORDER.APPROVED',
        'CHECKOUT.PAYMENT-APPROVAL.REVERSED',
        'PAYMENT.CAPTURE.PENDING',
        'PAYMENT.CAPTURE.COMPLETED',
        'PAYMENT.CAPTURE.DENIED',
    }
    if not event_id or not event_type:
        raise ValueError('PayPal webhook event id and type are required')
    if event_type not in supported:
        return {'status': 'IGNORED', 'event_id': event_id, 'event_type': event_type}

    order_id = _order_id(payload)
    resource = payload.get('resource') or {}
    if not order_id:
        raise ValueError('PayPal listing webhook does not identify an order')

    with transaction.atomic():
        event = PaymentWebhookEvent.objects.select_for_update().filter(
            provider='PAYPAL_LISTING', event_id=event_id
        ).first()
        if event and event.status == 'PROCESSED':
            return {'status': 'ALREADY_PROCESSED', 'event_id': event_id}
        if event is None:
            event = PaymentWebhookEvent.objects.create(
                provider='PAYPAL_LISTING',
                event_id=event_id,
                event_type=event_type,
                status='PROCESSING',
                metadata=payload,
            )
        else:
            event.status = 'PROCESSING'
            event.error = None
            event.metadata = payload
            event.save(update_fields=['status', 'error', 'metadata'])

        intent = ListingPaymentIntent.objects.select_for_update().filter(
            provider='PAYPAL', paypal_order_id=order_id
        ).first()
        if intent is None:
            event.status = 'IGNORED'
            event.processed_at = timezone.now()
            event.save(update_fields=['status', 'processed_at'])
            return {'status': 'IGNORED', 'reason': 'Unknown PayPal listing order', 'event_id': event_id}

        if intent.status == 'PAID':
            event.status = 'PROCESSED'
            event.processed_at = timezone.now()
            event.save(update_fields=['status', 'processed_at'])
            return {'status': 'ALREADY_PAID', 'event_id': event_id, 'intent_id': str(intent.id)}

        if event_type in {'CHECKOUT.ORDER.APPROVED', 'PAYMENT.CAPTURE.PENDING'}:
            event.status = 'PROCESSED'
            event.processed_at = timezone.now()
            event.save(update_fields=['status', 'processed_at'])
            return {'status': 'PENDING', 'event_id': event_id, 'intent_id': str(intent.id)}

        if event_type in {'CHECKOUT.PAYMENT-APPROVAL.REVERSED', 'PAYMENT.CAPTURE.DENIED'}:
            intent.status = 'FAILED'
            intent.updated_at = timezone.now()
            intent.save(update_fields=['status', 'updated_at'])
            message = str(payload.get('summary') or resource.get('status_details', {}).get('reason') or 'PayPal listing payment failed.')[:500]
            transaction.on_commit(lambda: publish_payment_status(
                user_id=intent.user_id,
                invoice_id=intent.id,
                status='FAILED',
                message=message,
                provider='PAYPAL',
                event_type=event_type,
                listing_id=intent.listing_id,
                details={'paypal_order_id': order_id},
            ))
            event.status = 'PROCESSED'
            event.processed_at = timezone.now()
            event.save(update_fields=['status', 'processed_at'])
            return {'status': 'FAILED', 'event_id': event_id, 'intent_id': str(intent.id)}

        paid_amount, currency = _capture_amount(resource)
        result = process_listing_payment(
            intent.id,
            provider='PAYPAL',
            payment_method='PAYPAL',
            provider_reference=str(resource.get('id') or order_id),
            provider_amount=paid_amount,
            provider_currency=currency,
            paypal_order_id=order_id,
            paypal_fx_rate=intent.paypal_fx_rate,
            paid_amount_kes=intent.amount_kes,
            result_description=str(payload.get('summary') or 'PayPal listing payment completed')[:2000],
        )
        transaction.on_commit(lambda: publish_payment_status(
            user_id=intent.user_id,
            invoice_id=intent.id,
            status='PAID',
            message='PayPal listing payment confirmed successfully.',
            provider='PAYPAL',
            event_type=event_type,
            listing_id=result.get('listing_id') or intent.listing_id,
            details={
                'paypal_order_id': order_id,
                'paypal_capture_id': resource.get('id'),
                'amount': str(paid_amount),
                'currency': currency,
            },
        ))
        event.status = 'PROCESSED'
        event.processed_at = timezone.now()
        event.save(update_fields=['status', 'processed_at'])
        return {**result, 'event_id': event_id}


def verify_and_process_paypal_listing_webhook(payload, headers):
    verify_paypal_webhook(payload, headers)
    return process_paypal_listing_webhook(payload)
