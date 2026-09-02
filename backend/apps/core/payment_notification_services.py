from django.db import transaction
from django.utils import timezone

from apps.accounts.models import Profile

from .domain_platform import NotificationEmail
from .email_templates import _details, _first_name, _layout, _status_panel


def _owner_id(invoice):
    return invoice.landlord_subscription_id and invoice.landlord_subscription.landlord_id or (
        invoice.real_estate_subscription_id and invoice.real_estate_subscription.real_estate_id
    )


def _owner_profile(invoice):
    owner_id = _owner_id(invoice)
    return Profile.objects.filter(pk=owner_id).first() if owner_id else None


def build_payment_success_email(invoice, profile, provider):
    name = _first_name({'full_name': getattr(profile, 'full_name', ''), 'email': profile.email})
    transaction_id = invoice.provider_transaction_id or invoice.provider_reference or invoice.mpesa_receipt or invoice.paypal_subscription_id or invoice.id
    amount = invoice.amount_kes
    currency = invoice.currency or 'KES'
    if currency == 'USD' and invoice.amount_usd is not None:
        amount_text = f"USD {invoice.amount_usd}"
    else:
        amount_text = f"KES {amount}"
    body = _status_panel(
        'Payment Successful',
        'Your Saka Krib subscription payment has been securely confirmed.',
        '#e8f5e9',
    )
    body += (
        f"<div style='padding:30px'><p>Hello {name},</p>"
        "<p style='line-height:1.7;color:#444'>Thank you for your payment. Your subscription payment has been confirmed by Saka Krib and your account has been updated.</p>"
    )
    body += _details([
        ('Invoice ID', invoice.id),
        ('Transaction ID', transaction_id),
        ('Payment Method', provider),
        ('Amount', amount_text),
        ('Payment Status', 'PAID'),
        ('Paid At', invoice.paid_at or timezone.now()),
        ('Listing ID', invoice.listing_id),
    ]).replace('APPLICATION DETAILS', 'PAYMENT DETAILS')
    body += (
        "<div style='margin:25px 0;padding:18px;background:#f5f7f6;border-radius:10px'>"
        "<p style='margin:0;color:#555;line-height:1.7'>Please keep this email as your payment receipt. Your subscription is now active, subject to the terms of your selected plan.</p>"
        "</div></div>"
    )
    return _layout('Saka Krib Payment Receipt', body, 'Secure property services and subscriptions')


def queue_payment_success_email(invoice_id, provider):
    """Queue one success receipt for the invoice owner after authoritative settlement."""
    from apps.subscriptions.models import SubscriptionInvoice

    invoice = SubscriptionInvoice.objects.select_related(
        'landlord_subscription', 'real_estate_subscription'
    ).filter(pk=invoice_id, status='PAID').first()
    if not invoice:
        return None
    profile = _owner_profile(invoice)
    if not profile or not str(profile.email or '').strip():
        return None

    event_key = f'payment-success-email:{invoice.id}'
    existing = NotificationEmail.objects.filter(
        recipient=profile.email.strip().lower(),
        template_type='payment_success',
        subject__icontains=str(invoice.id),
    ).first()
    if existing:
        return existing

    html_body = build_payment_success_email(invoice, profile, provider)
    return NotificationEmail.objects.create(
        recipient=profile.email.strip().lower(),
        subject=f'Saka Krib payment receipt — Invoice {invoice.id}',
        html_body=html_body,
        template_type='payment_success',
        status='pending',
    )


def schedule_payment_success_email(invoice_id, provider):
    def enqueue():
        from .payment_email_tasks import send_payment_success_email
        send_payment_success_email.delay(str(invoice_id), provider)

    transaction.on_commit(enqueue)
