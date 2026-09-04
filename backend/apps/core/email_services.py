from datetime import timedelta
from html import escape

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.utils import timezone

from .booking_email_templates import mover_booking_request
from .domain_platform import NotificationEmail
from .email_templates import EMAIL_SUBJECTS, EMAIL_TEMPLATES

# Keep booking email presentation separate while registering it with the
# existing template/queue architecture used by all other notification emails.
EMAIL_TEMPLATES = {
    **EMAIL_TEMPLATES,
    "mover_booking_request": mover_booking_request,
}
EMAIL_SUBJECTS = {
    **EMAIL_SUBJECTS,
    "mover_booking_request": "New Saka Krib moving request",
}


def queue_email(*, recipient: str, template_type: str, payload: dict) -> NotificationEmail:
    recipient = str(recipient or "").strip().lower()
    if not recipient:
        raise ValueError("Recipient email is required")
    template_type = str(template_type or "generic").strip()
    template = EMAIL_TEMPLATES.get(template_type)
    subject = EMAIL_SUBJECTS.get(template_type, payload.get("subject") or "Saka Krib notification")
    if template is None:
        raise ValueError(f"Unknown email template: {template_type}")

    html_body = template(payload)
    if not html_body.strip():
        raise ValueError("Email template returned empty HTML")

    return NotificationEmail.objects.create(
        recipient=recipient,
        subject=subject,
        html_body=html_body,
        template_type=template_type,
        status="pending",
        created_at=timezone.now(),
    )


def queue_mover_payout_success_emails(*, payout, mover_email: str, mover_name: str, admin_email: str = "") -> int:
    """Queue idempotent success emails after a provider-confirmed payout release."""
    payout_key = str(payout.id)
    booking_id = str(payout.booking_id)
    provider = str(payout.payout_provider or "MPESA")
    provider_reference = str(payout.payout_provider_reference or "")
    provider_transaction_id = str(payout.payout_provider_transaction_id or "")
    amount = f"KES {payout.net_mover_payable:,.2f}"
    released_at = payout.payout_completed_at or timezone.now()
    invoice = getattr(payout, "booking", None)
    invoice_number = ""
    if invoice is not None:
        invoice_number = str(getattr(invoice, "invoice_number", "") or "")
    if not invoice_number:
        from .domain_bookings import MovingInvoice
        invoice_number = str(
            MovingInvoice.objects.filter(booking_id=payout.booking_id)
            .values_list("invoice_number", flat=True)
            .first()
            or ""
        )

    recipients = []
    mover_recipient = str(mover_email or "").strip().lower()
    if mover_recipient:
        recipients.append((mover_recipient, "mover"))
    admin_recipient = str(admin_email or getattr(settings, "ADMIN_EMAIL", "") or "").strip().lower()
    if admin_recipient and admin_recipient != mover_recipient:
        recipients.append((admin_recipient, "admin"))

    queued = 0
    for recipient, audience in recipients:
        template_type = "mover_payout_released" if audience == "mover" else "mover_payout_released_admin"
        existing = NotificationEmail.objects.filter(
            recipient=recipient,
            template_type=template_type,
            html_body__contains=payout_key,
        ).exists()
        if existing:
            continue
        if audience == "mover":
            greeting = escape((mover_name or "there").strip().split()[0])
            title = "Mover payout successfully released"
            message = "Your escrowed moving-service payout has been successfully released to your M-Pesa account."
        else:
            greeting = "Administrator"
            title = "Mover payout successfully released"
            message = "An admin-released mover escrow payout has been confirmed successful by the payment provider."
        html_body = f"""<!DOCTYPE html>
<html><body style=\"margin:0;padding:30px 15px;background:#f6f7f9;color:#222;font-family:Arial,Helvetica,sans-serif;\">
<div style=\"max-width:600px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;\">
<div style=\"padding:30px;text-align:center;\"><h1 style=\"margin:0;color:#255d3a;\">Saka Krib</h1><p style=\"color:#777;\">Payment confirmation</p></div>
<div style=\"padding:30px;\"><h2 style=\"color:#1b5e20;\">{escape(title)}</h2><p>Hello {greeting},</p><p style=\"line-height:1.7;color:#444;\">{escape(message)}</p>
<table width=\"100%\" cellpadding=\"8\" cellspacing=\"0\" style=\"border-collapse:collapse;background:#f5f7f6;border-radius:10px;\">
<tr><td>Booking</td><td align=\"right\"><strong>{escape(booking_id)}</strong></td></tr>
<tr><td>Invoice</td><td align=\"right\"><strong>{escape(invoice_number or 'N/A')}</strong></td></tr>
<tr><td>Amount</td><td align=\"right\"><strong>{escape(amount)}</strong></td></tr>
<tr><td>Provider</td><td align=\"right\"><strong>{escape(provider)}</strong></td></tr>
<tr><td>Provider reference</td><td align=\"right\"><strong>{escape(provider_reference or 'N/A')}</strong></td></tr>
<tr><td>Transaction ID</td><td align=\"right\"><strong>{escape(provider_transaction_id or 'N/A')}</strong></td></tr>
<tr><td>Released</td><td align=\"right\"><strong>{escape(released_at.isoformat())}</strong></td></tr>
</table>
<p style=\"margin-top:25px;color:#777;font-size:13px;line-height:1.6;\">Keep this email for your records. The canonical moving invoice remains available in Saka Krib for future reference.</p>
</div><div style=\"padding:22px;text-align:center;background:#1e1e1e;color:#aaa;font-size:12px;\">Saka Krib · support@sakakrib.com</div>
</div></body></html>"""
        NotificationEmail.objects.create(
            recipient=recipient,
            subject="Mover payout successfully released - Saka Krib",
            html_body=html_body,
            template_type=template_type,
            status="pending",
            created_at=timezone.now(),
        )
        queued += 1
    return queued


def send_notification_email(email: NotificationEmail) -> dict:
    from_address = str(
        getattr(settings, "EMAIL_FROM", "")
        or getattr(settings, "DEFAULT_FROM_EMAIL", "")
        or getattr(settings, "EMAIL_HOST_USER", "")
        or ""
    ).strip()
    if not from_address:
        raise RuntimeError("EMAIL_FROM, DEFAULT_FROM_EMAIL, or EMAIL_HOST_USER is not configured")

    message = EmailMultiAlternatives(
        subject=email.subject,
        body=email.html_body,
        from_email=from_address,
        to=[email.recipient],
        reply_to=[from_address],
    )
    message.attach_alternative(email.html_body, "text/html")
    sent = message.send(fail_silently=False)
    if sent != 1:
        raise RuntimeError("SMTP server did not accept the email")

    email.status = "sent"
    email.sent_at = timezone.now()
    email.save(update_fields=["status", "sent_at"])

    if email.template_type == "otp_verification":
        from apps.accounts.auth_service import OTP_EXPIRY_SECONDS
        from apps.accounts.models import Profile

        sent_at = email.sent_at or timezone.now()
        Profile.objects.filter(
            email__iexact=email.recipient,
            email_verified=False,
        ).update(
            signup_otp_expires_at=sent_at + timedelta(seconds=OTP_EXPIRY_SECONDS),
            updated_at=timezone.now(),
        )

    return {"sent": True, "notification_id": str(email.id)}
