import base64
import json
import urllib.parse
import urllib.request
from decimal import Decimal, InvalidOperation

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.core.domain_platform import PaymentWebhookEvent
from apps.core.payment_events import publish_payment_status

from .models import LandlordSubscription, RealEstateSubscription, SubscriptionInvoice


PAYPAL_SUBSCRIPTION_EVENTS = {
    'BILLING.SUBSCRIPTION.ACTIVATED',
    'BILLING.SUBSCRIPTION.UPDATED',
    'BILLING.SUBSCRIPTION.CANCELLED',
    'BILLING.SUBSCRIPTION.SUSPENDED',
    'BILLING.SUBSCRIPTION.EXPIRED',
    'BILLING.SUBSCRIPTION.PAYMENT.FAILED',
    'PAYMENT.SALE.COMPLETED',
    'PAYMENT.SALE.REFUNDED',
    'PAYMENT.SALE.REVERSED',
}


def _paypal_token():
    client_id = getattr(settings, 'PAYPAL_CLIENT_ID', '')
    client_secret = getattr(settings, 'PAYPAL_CLIENT_SECRET', '')
    if not client_id or not client_secret:
        raise RuntimeError('PayPal credentials are not configured')
    raw = f'{client_id}:{client_secret}'.encode()
    auth = base64.b64encode(raw).decode()
    body = urllib.parse.urlencode({'grant_type': 'client_credentials'}).encode()
    request = urllib.request.Request(
        f'{settings.PAYPAL_BASE_URL}/v1/oauth2/token',
        data=body,
        method='POST',
        headers={'Authorization': f'Basic {auth}', 'Content-Type': 'application/x-www-form-urlencoded'},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            data = json.loads(response.read().decode())
    except Exception as exc:
        raise RuntimeError('Unable to authenticate with PayPal') from exc
    token = data.get('access_token')
    if not token:
        raise RuntimeError('PayPal access token missing')
    return token


def _paypal_json(path, *, method='GET', body=None, token=None):
    headers = {'Accept': 'application/json'}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    if body is not None:
        headers['Content-Type'] = 'application/json'
    request = urllib.request.Request(
        f'{settings.PAYPAL_BASE_URL}{path}',
        data=json.dumps(body).encode() if body is not None else None,
        method=method,
        headers=headers,
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode())
    except Exception as exc:
        raise RuntimeError('PayPal request failed') from exc


def create_paypal_subscription(*, plan_id, custom_id, return_url, cancel_url):
    if not plan_id:
        raise ValueError('PayPal plan ID is required')
    if not return_url or not cancel_url:
        raise RuntimeError('PayPal subscription return/cancel URLs are not configured')
    payload = {
        'plan_id': str(plan_id),
        'custom_id': str(custom_id)[:127],
        'application_context': {
            'brand_name': 'SakaKrib',
            'user_action': 'SUBSCRIBE_NOW',
            'return_url': return_url,
            'cancel_url': cancel_url,
        },
    }
    result = _paypal_json('/v1/billing/subscriptions', method='POST', body=payload, token=_paypal_token())
    subscription_id = str(result.get('id') or '').strip()
    approval_url = next(
        (str(link.get('href')) for link in result.get('links', []) if link.get('rel') == 'approve' and link.get('href')),
        None,
    )
    if not subscription_id or not approval_url:
        raise RuntimeError('PayPal did not return a subscription approval link')
    return result


def verify_paypal_webhook(payload, headers, *, webhook_id_setting='PAYPAL_WEBHOOK_ID'):
    webhook_id = getattr(settings, webhook_id_setting, '')
    if not webhook_id:
        raise RuntimeError(f'{webhook_id_setting} is not configured')
    required = {
        'transmission_id': headers.get('PAYPAL-TRANSMISSION-ID'),
        'transmission_time': headers.get('PAYPAL-TRANSMISSION-TIME'),
        'cert_url': headers.get('PAYPAL-CERT-URL'),
        'auth_algo': headers.get('PAYPAL-AUTH-ALGO'),
        'transmission_sig': headers.get('PAYPAL-TRANSMISSION-SIG'),
    }
    if not all(required.values()):
        raise ValueError('Incomplete PayPal webhook signature headers')
    result = _paypal_json(
        '/v1/notifications/verify-webhook-signature',
        method='POST',
        body={**required, 'webhook_id': webhook_id, 'webhook_event': payload},
        token=_paypal_token(),
    )
    if result.get('verification_status') != 'SUCCESS':
        raise ValueError('Invalid PayPal webhook signature')
    return True


def _subscription_for_paypal_id(subscription_id):
    if not subscription_id:
        return None, None
    landlord = LandlordSubscription.objects.select_for_update().filter(paypal_subscription_id=subscription_id).first()
    if landlord:
        return landlord, 'landlord'
    real_estate = RealEstateSubscription.objects.select_for_update().filter(paypal_subscription_id=subscription_id).first()
    if real_estate:
        return real_estate, 'real_estate'
    return None, None


def _event_subscription_id(payload):
    resource = payload.get('resource') or {}
    if payload.get('event_type', '').startswith('BILLING.SUBSCRIPTION.'):
        return resource.get('id')
    related = (resource.get('supplementary_data') or {}).get('related_ids') or {}
    return resource.get('billing_agreement_id') or related.get('subscription_id')


def _next_billing_time(resource):
    value = resource.get('billing_info', {}).get('next_billing_time') or resource.get('next_billing_time')
    if not value:
        return None
    from django.utils.dateparse import parse_datetime
    return parse_datetime(value)


def _period_end(subscription, now, resource):
    next_billing = _next_billing_time(resource)
    if next_billing and next_billing > now:
        return next_billing
    from datetime import timedelta
    return now + (timedelta(days=365) if subscription.billing_cycle == 'ANNUAL' else timedelta(days=30))


def record_paypal_subscription_approval(invoice_id, paypal_subscription_id):
    """Bind the PayPal subscription to the pending invoice without declaring payment success."""
    if not paypal_subscription_id:
        raise ValueError('PayPal subscription ID is required')
    with transaction.atomic():
        invoice = SubscriptionInvoice.objects.select_for_update().filter(
            pk=invoice_id, status='PENDING', payment_provider='PAYPAL'
        ).first()
        if not invoice:
            raise ValueError('Pending PayPal subscription invoice not found')
        subscription_id = invoice.landlord_subscription_id or invoice.real_estate_subscription_id
        subscription_model = LandlordSubscription if invoice.landlord_subscription_id else RealEstateSubscription
        subscription = subscription_model.objects.select_for_update().get(pk=subscription_id)
        details = _paypal_json(
            f'/v1/billing/subscriptions/{urllib.parse.quote(str(paypal_subscription_id), safe="")}',
            token=_paypal_token(),
        )
        remote_plan_id = (details.get('plan_id') or '').strip()
        if remote_plan_id and remote_plan_id != subscription.paypal_plan_id:
            raise ValueError('PayPal subscription plan does not match the selected SakaKrib plan')
        subscription.paypal_subscription_id = paypal_subscription_id
        subscription.paypal_status = str(details.get('status') or 'APPROVAL_PENDING')
        subscription.next_billing_at = _next_billing_time(details)
        subscription.updated_at = timezone.now()
        subscription.save(update_fields=['paypal_subscription_id', 'paypal_status', 'next_billing_at', 'updated_at'])
        invoice.paypal_subscription_id = paypal_subscription_id
        invoice.provider_reference = paypal_subscription_id
        invoice.save(update_fields=['paypal_subscription_id', 'provider_reference'])
        return {'success': True, 'status': 'PENDING_PAYMENT', 'invoice_id': str(invoice.id), 'subscription_id': str(subscription.id), 'paypal_subscription_id': paypal_subscription_id, 'listing_id': str(invoice.listing_id) if invoice.listing_id else None}


@transaction.atomic
def process_paypal_subscription_webhook(payload):
    event_id = str(payload.get('id') or '').strip()
    event_type = str(payload.get('event_type') or '').strip()
    if not event_id or not event_type:
        raise ValueError('PayPal webhook event id and type are required')
    if event_type not in PAYPAL_SUBSCRIPTION_EVENTS:
        return {'status': 'IGNORED', 'event_id': event_id, 'event_type': event_type}

    existing = PaymentWebhookEvent.objects.select_for_update().filter(provider='PAYPAL_SUBSCRIPTION', event_id=event_id).first()
    if existing and existing.status == 'PROCESSED':
        return {'status': 'ALREADY_PROCESSED', 'event_id': event_id}
    if existing is None:
        existing = PaymentWebhookEvent.objects.create(provider='PAYPAL_SUBSCRIPTION', event_id=event_id, event_type=event_type, status='PROCESSING', metadata=payload)
    else:
        existing.status = 'PROCESSING'
        existing.error = None
        existing.metadata = payload
        existing.save(update_fields=['status', 'error', 'metadata'])

    subscription_id = _event_subscription_id(payload)
    subscription, audience = _subscription_for_paypal_id(subscription_id)
    resource = payload.get('resource') or {}
    now = timezone.now()

    if subscription is None:
        existing.status = 'IGNORED'
        existing.processed_at = now
        existing.save(update_fields=['status', 'processed_at'])
        return {'status': 'IGNORED', 'reason': 'Unknown PayPal subscription', 'event_id': event_id}

    owner_id = subscription.landlord_id if audience == 'landlord' else subscription.real_estate_id
    invoice = None
    payment_status = None
    message = None
    listing_id = None

    if event_type == 'BILLING.SUBSCRIPTION.ACTIVATED':
        subscription.paypal_status = 'ACTIVE'
        subscription.next_billing_at = _next_billing_time(resource) or subscription.next_billing_at
        subscription.updated_at = now
        subscription.save(update_fields=['paypal_status', 'next_billing_at', 'updated_at'])

    elif event_type == 'BILLING.SUBSCRIPTION.UPDATED':
        status = str(resource.get('status') or '').upper()
        subscription.paypal_status = status or subscription.paypal_status
        subscription.next_billing_at = _next_billing_time(resource) or subscription.next_billing_at
        subscription.auto_renew = status == 'ACTIVE' and not subscription.cancel_at_period_end
        subscription.updated_at = now
        subscription.save(update_fields=['paypal_status', 'next_billing_at', 'auto_renew', 'updated_at'])

    elif event_type == 'BILLING.SUBSCRIPTION.CANCELLED':
        subscription.paypal_status = 'CANCELLED'
        subscription.cancel_at_period_end = True
        subscription.cancelled_at = now
        subscription.auto_renew = False
        subscription.updated_at = now
        subscription.save(update_fields=['paypal_status', 'cancel_at_period_end', 'cancelled_at', 'auto_renew', 'updated_at'])

    elif event_type == 'BILLING.SUBSCRIPTION.SUSPENDED':
        subscription.paypal_status = 'SUSPENDED'
        subscription.auto_renew = False
        subscription.updated_at = now
        subscription.save(update_fields=['paypal_status', 'auto_renew', 'updated_at'])

    elif event_type == 'BILLING.SUBSCRIPTION.EXPIRED':
        subscription.paypal_status = 'EXPIRED'
        subscription.status = 'EXPIRED'
        subscription.auto_renew = False
        subscription.updated_at = now
        subscription.save(update_fields=['paypal_status', 'status', 'auto_renew', 'updated_at'])

    elif event_type == 'BILLING.SUBSCRIPTION.PAYMENT.FAILED':
        invoice = SubscriptionInvoice.objects.select_for_update().filter(
            paypal_subscription_id=subscription_id, status='PENDING'
        ).order_by('-created_at').first()
        if invoice is None:
            invoice = SubscriptionInvoice.objects.select_for_update().filter(
                paypal_subscription_id=subscription_id
            ).order_by('-created_at').first()
        if invoice:
            invoice.status = 'FAILED'
            invoice.result_description = str(resource.get('status_change_note') or payload.get('summary') or 'PayPal subscription payment failed')[:2000]
            invoice.webhook_event_id = event_id
            invoice.save(update_fields=['status', 'result_description', 'webhook_event_id'])
            listing_id = invoice.listing_id
        subscription.paypal_status = 'PAYMENT_FAILED'
        subscription.updated_at = now
        subscription.save(update_fields=['paypal_status', 'updated_at'])
        payment_status = 'FAILED'
        message = invoice.result_description if invoice else 'PayPal subscription payment failed.'

    elif event_type == 'PAYMENT.SALE.COMPLETED':
        amount_data = resource.get('amount') or {}
        try:
            paid_usd = Decimal(str(amount_data.get('total') or amount_data.get('value')))
        except (InvalidOperation, TypeError):
            raise ValueError('PayPal recurring payment amount is invalid')
        if paid_usd <= 0:
            raise ValueError('PayPal recurring payment amount must be positive')
        expected_usd = subscription.billing_amount_usd
        if expected_usd is not None and abs(paid_usd - expected_usd) > Decimal('0.01'):
            raise ValueError('PayPal recurring payment amount does not match the subscription price')

        sale_reference = str(resource.get('id') or subscription_id)
        invoice = SubscriptionInvoice.objects.select_for_update().filter(
            paypal_subscription_id=subscription_id, status='PENDING'
        ).order_by('-created_at').first()
        if invoice is not None:
            invoice.amount_usd = paid_usd
            invoice.currency = 'USD'
            invoice.provider_transaction_id = sale_reference
            invoice.webhook_event_id = event_id
            invoice.result_description = str(payload.get('summary') or 'PayPal payment completed')[:2000]
            invoice.save(update_fields=['amount_usd', 'currency', 'provider_transaction_id', 'webhook_event_id', 'result_description'])
            from .payment_services import _activate_invoice
            activated = _activate_invoice(invoice, provider='PAYPAL', provider_reference=subscription_id, transaction_id=sale_reference)
            listing_id = activated.get('listing_id')
        else:
            end = _period_end(subscription, now, resource)
            invoice = SubscriptionInvoice.objects.create(
                amount_kes=subscription.billing_amount_kes or Decimal('0'),
                amount_usd=paid_usd,
                currency='USD',
                status='PAID',
                payment_provider='PAYPAL',
                payment_method='PAYPAL',
                provider_reference=sale_reference,
                provider_transaction_id=sale_reference,
                paypal_subscription_id=subscription_id,
                billing_period_start=subscription.current_period_end or now,
                billing_period_end=end,
                paid_at=now,
                created_at=now,
                webhook_event_id=event_id,
                landlord_subscription_id=subscription.id if audience == 'landlord' else None,
                real_estate_subscription_id=subscription.id if audience == 'real_estate' else None,
                pricing_snapshot_source='subscription_plans',
            )
            subscription.status = 'ACTIVE'
            subscription.paypal_status = 'ACTIVE'
            subscription.auto_renew = not subscription.cancel_at_period_end
            subscription.current_period_start = invoice.billing_period_start
            subscription.current_period_end = invoice.billing_period_end
            subscription.next_billing_at = _next_billing_time(resource) or invoice.billing_period_end
            subscription.grace_period_end = None
            subscription.updated_at = now
            subscription.save(update_fields=['status', 'paypal_status', 'auto_renew', 'current_period_start', 'current_period_end', 'next_billing_at', 'grace_period_end', 'updated_at'])
        payment_status = 'PAID'
        message = 'PayPal payment confirmed successfully.'
        listing_id = invoice.listing_id if invoice else None

    elif event_type in {'PAYMENT.SALE.REFUNDED', 'PAYMENT.SALE.REVERSED'}:
        invoice = SubscriptionInvoice.objects.select_for_update().filter(
            paypal_subscription_id=subscription_id
        ).order_by('-created_at').first()
        if invoice:
            invoice.status = 'REFUNDED' if event_type.endswith('REFUNDED') else 'FAILED'
            invoice.result_description = str(payload.get('summary') or event_type.replace('.', ' ').title())[:2000]
            invoice.webhook_event_id = event_id
            invoice.save(update_fields=['status', 'result_description', 'webhook_event_id'])
            listing_id = invoice.listing_id
        subscription.paypal_status = 'REFUNDED' if event_type.endswith('REFUNDED') else 'REVERSED'
        subscription.updated_at = now
        subscription.save(update_fields=['paypal_status', 'updated_at'])
        payment_status = 'REFUNDED' if event_type.endswith('REFUNDED') else 'FAILED'
        message = str(payload.get('summary') or event_type.replace('.', ' ').title())

    existing.status = 'PROCESSED'
    existing.processed_at = now
    existing.save(update_fields=['status', 'processed_at'])

    if payment_status:
        transaction.on_commit(lambda: publish_payment_status(
            user_id=owner_id,
            invoice_id=invoice.id if invoice else existing.id,
            status=payment_status,
            message=message or 'PayPal payment status updated.',
            provider='PAYPAL',
            event_type=event_type,
            listing_id=listing_id,
            subscription_id=subscription.id,
            subscription_status=subscription.status,
        ))

    return {
        'status': payment_status or 'PROCESSED',
        'event_id': event_id,
        'event_type': event_type,
        'invoice_id': str(invoice.id) if invoice else None,
        'listing_id': str(listing_id) if listing_id else None,
    }
