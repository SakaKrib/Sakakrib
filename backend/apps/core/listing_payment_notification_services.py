from django.utils import timezone

from apps.accounts.models import Profile
from apps.payments.models import ListingPayment

from .domain_platform import NotificationEmail
from .email_templates import _details, _first_name, _layout, _status_panel


def build_listing_payment_success_email(payment, profile):
    name = _first_name({'full_name': getattr(profile, 'full_name', ''), 'email': profile.email})
    transaction_id = payment.mpesa_receipt or payment.provider_reference or payment.paypal_order_id or payment.id
    rows = [
        ('Payment ID', payment.id),
        ('Transaction ID', transaction_id),
        ('Payment Method', payment.payment_method or payment.payment_provider or '—'),
        ('Payment Status', 'PAID'),
        ('Paid At', payment.paid_at or timezone.now()),
        ('Listing Fee', f'KES {payment.amount_kes}'),
        ('Listing ID', payment.listing_id),
    ]
    if payment.provider_amount is not None and payment.provider_currency:
        rows.append(('Provider Amount', f'{payment.provider_amount} {payment.provider_currency}'))
    if payment.mpesa_receipt:
        rows.append(('M-Pesa Receipt', payment.mpesa_receipt))
    if payment.paypal_order_id:
        rows.append(('PayPal Order', payment.paypal_order_id))

    body = _status_panel(
        'Listing Payment Successful',
        'Your Saka Krib KES 1,000 individual listing payment has been securely confirmed.',
        '#e8f5e9',
    )
    body += (
        f"<div style='padding:30px'><p>Hello {name},</p>"
        "<p style='line-height:1.7;color:#444'>Thank you for your payment. Saka Krib has confirmed your individual listing payment and recorded the receipt below.</p>"
    )
    body += _details(rows).replace('APPLICATION DETAILS', 'PAYMENT RECEIPT')
    body += (
        "<div style='margin:25px 0;padding:18px;background:#f5f7f6;border-radius:10px'>"
        "<p style='margin:0;color:#555;line-height:1.7'>Please keep this email as your receipt. Your listing can continue through the Saka Krib listing workflow and remains subject to the normal review process.</p>"
        "</div></div>"
    )
    return _layout('Saka Krib Listing Payment Receipt', body, 'Secure property services and listings')


def queue_listing_payment_success_email(payment_id):
    payment = ListingPayment.objects.select_related('user', 'listing').filter(pk=payment_id, status='PAID').first()
    if not payment:
        return None
    profile = Profile.objects.filter(pk=payment.user_id).first()
    if not profile or not str(profile.email or '').strip():
        return None

    recipient = profile.email.strip().lower()
    subject = f'Saka Krib listing payment receipt — {payment.id}'
    existing = NotificationEmail.objects.filter(
        recipient=recipient,
        template_type='listing_payment_success',
        subject=subject,
    ).first()
    if existing:
        return existing

    return NotificationEmail.objects.create(
        recipient=recipient,
        subject=subject,
        html_body=build_listing_payment_success_email(payment, profile),
        template_type='listing_payment_success',
        status='pending',
    )
