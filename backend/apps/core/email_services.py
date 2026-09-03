from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.utils import timezone
from html import escape

from .domain_platform import NotificationEmail
from .email_templates import EMAIL_SUBJECTS, EMAIL_TEMPLATES


def _sign_in_notification(payload: dict) -> str:
    email = escape(str(payload.get('email') or ''))
    sign_in_time = escape(str(payload.get('sign_in_time') or ''))
    device = escape(str(payload.get('device') or 'Unknown device'))
    location = escape(str(payload.get('location') or 'Unknown location'))
    return f'''<!doctype html>
<html><body style="margin:0;background:#f6f7f9;font-family:Arial,sans-serif;color:#1f2937">
<div style="max-width:600px;margin:32px auto;background:#fff;border-radius:14px;padding:32px;box-shadow:0 2px 12px rgba(0,0,0,.06)">
<h2 style="margin:0 0 12px">New sign-in to your Saka Krib account</h2>
<p style="line-height:1.6">A successful sign-in was detected for <strong>{email}</strong>.</p>
<table style="width:100%;border-collapse:collapse;margin:20px 0">
<tr><td style="padding:8px 0;color:#6b7280">Time</td><td style="padding:8px 0">{sign_in_time}</td></tr>
<tr><td style="padding:8px 0;color:#6b7280">Device</td><td style="padding:8px 0;word-break:break-word">{device}</td></tr>
<tr><td style="padding:8px 0;color:#6b7280">Network address</td><td style="padding:8px 0">{location}</td></tr>
</table>
<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px">
<strong>If this was you</strong><br>Your account is ready to use. No action is required.
</div>
<div style="margin-top:24px;padding-top:18px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280">Saka Krib security notification</div>
</div></body></html>'''


def queue_email(*, recipient: str, template_type: str, payload: dict) -> NotificationEmail:
    recipient = str(recipient or "").strip().lower()
    if not recipient:
        raise ValueError("Recipient email is required")
    template_type = str(template_type or "generic").strip()
    template = _sign_in_notification if template_type == 'sign_in_notification' else EMAIL_TEMPLATES.get(template_type)
    subject = EMAIL_SUBJECTS.get(template_type, payload.get("subject") or "Saka Krib notification")
    if template_type == 'sign_in_notification':
        subject = 'Saka Krib security alert: new sign-in'
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
    )


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
    return {"sent": True, "notification_id": str(email.id)}
