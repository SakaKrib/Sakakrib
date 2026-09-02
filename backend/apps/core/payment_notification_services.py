from django.utils import timezone

from apps.accounts.models import Profile

from .domain_platform import NotificationEmail
from .email_templates import _details, _first_name, _layout, _status_panel


def _owner_id(invoice):
    if invoice.landlord_subscription_id:
        return invoice.landlord_subscription.landlord_id
    if invoice.real_estate_subscription_id:
        return invoice.real_estate_subscription.real_estate_id
    return None


def _owner_profile(invoice):
    owner_id = _owner_id(invoice)
    return Profile.objects.filter(pk=owner_id).first() if owner_id else None


def build_payment_success_email(invoice, profile, provider):
    name = _first_name({'full_name': getattr(profile, 'full_name', ''), 'email': profile.email})
    transaction_id = (
        invoice.provider_transaction_id
        or invoice.mpesa_receipt
        or invoice.provider_reference
        or invoice.paypal_subscription_id
        or invoice.id
    )
    rows = [
        ('Invoice ID', invoice.id),
        ('Transaction ID', transaction_id),
        ('Payment Method', provider),
        ('Payment Status', 'PAID'),
        ('Paid At', invoice.paid_at or timezone.now()),
        ('Plan Amount (KES)', invoice.amount_kes),
    ]
    if invoice.amount_usd is not None:
        rows.append(('PayPal Amount (USD)', invoice.amount_usd))
    if invoice.listing_id:
        rows.append(('Listing ID', invoice.listing_id))

    body = _status_panel(
        'Payment Successful',
        'Your Saka Krib subscription payment has been securely confirmed.',
        '#e8f5e9',
    )
    body += (
        f"<div style='padding:30px'><p>Hello {name},</p>"
        "<p style='line-height:1.7;color:#444'>Thank you for your payment. Your subscription payment has been confirmed by Saka Krib and your account has been updated.</p>"
    )
    body += _details(rows).replace('APPLICATION DETAILS', 'PAYMENT DETAILS')
    body += (
        "<div style='margin:25px 0;padding:18px;background:#f5f7f6;border-radius:10px'>"
        "<p style='margin:0;color:#555;line-height:1.7'>Please keep this email as your payment receipt. Your subscription is now active, subject to the terms of your selected plan.</p>"
        "</div></div>"
    )
    return _layout('Saka Krib Payment Receipt', body, 'Secure property services and subscriptions')


def queue_payment_success_email(invoice_id, provider):
    """Create one receipt email for an authoritative PAID subscription invoice."""
    from apps.subscriptions.models import SubscriptionInvoice

    invoice = SubscriptionInvoice.objects.select_related(
        'landlord_subscription', 'real_estate_subscription'
    ).filter(pk=invoice_id, status='PAID').first()
    if not invoice:
        return None

    profile = _owner_profile(invoice)
    if not profile or not str(profile.email or '').strip():
        return None

    recipient = profile.email.strip().lower()
    subject = f'Saka Krib payment receipt — Invoice {invoice.id}'
    existing = NotificationEmail.objects.filter(
        recipient=recipient,
        template_type='payment_success',
        subject=subject,
    ).first()
    if existing:
        return existing

    return NotificationEmail.objects.create(
        recipient=recipient,
        subject=subject,
        html_body=build_payment_success_email(invoice, profile, provider),
        template_type='payment_success',
        status='pending',
    )
