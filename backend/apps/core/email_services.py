from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.utils import timezone

from .domain_platform import NotificationEmail
from .email_templates import EMAIL_SUBJECTS, EMAIL_TEMPLATES


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
