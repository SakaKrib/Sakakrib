import json
import os
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from django.utils import timezone

from .domain_platform import NotificationEmail
from .email_templates import EMAIL_SUBJECTS, EMAIL_TEMPLATES


RESEND_API_URL = "https://api.resend.com/emails"


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
    email = NotificationEmail.objects.create(
        recipient=recipient,
        subject=subject,
        html_body=html_body,
        template_type=template_type,
        status="pending",
    )
    return email


def send_notification_email(email: NotificationEmail) -> dict:
    api_key = os.getenv("RESEND_API_KEY", "").strip()
    from_address = os.getenv("EMAIL_FROM", "").strip() or os.getenv("DEFAULT_FROM_EMAIL", "").strip()
    if not api_key:
        raise RuntimeError("RESEND_API_KEY is not configured")
    if not from_address:
        raise RuntimeError("EMAIL_FROM or DEFAULT_FROM_EMAIL is not configured")

    payload = json.dumps({
        "from": from_address,
        "to": [email.recipient],
        "subject": email.subject,
        "html": email.html_body,
    }).encode("utf-8")
    request = Request(
        RESEND_API_URL,
        data=payload,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Idempotency-Key": f"sakakrib-notification-{email.id}",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=20) as response:
            raw = response.read().decode("utf-8")
            data = json.loads(raw) if raw else {}
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:1000]
        raise RuntimeError(f"Resend failed with status {exc.code}: {detail}") from exc
    except URLError as exc:
        raise RuntimeError(f"Unable to reach Resend: {exc.reason}") from exc

    email.status = "sent"
    email.sent_at = timezone.now()
    email.save(update_fields=["status", "sent_at"])
    return {"sent": True, "notification_id": str(email.id), "resend_id": data.get("id")}
