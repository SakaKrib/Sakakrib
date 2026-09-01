from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.utils.html import escape

from apps.accounts.models import Profile

from .domain_platform import NotificationEmail, UserNotification


@transaction.atomic
def dispatch_user_notification(*, user_id, notification_type, title, message, data=None,
                               event_key=None, send_email=True, email_template="generic"):
    if not user_id:
        raise ValidationError("Recipient is required")
    if not str(notification_type or "").strip():
        raise ValidationError("Notification type is required")
    if not str(title or "").strip():
        raise ValidationError("Notification title is required")
    if not str(message or "").strip():
        raise ValidationError("Notification message is required")

    if event_key:
        existing = UserNotification.objects.filter(event_key=event_key).first()
        if existing:
            return {
                "status": "ALREADY_QUEUED",
                "notification_id": str(existing.id),
                "email_id": None,
            }

    profile = Profile.objects.filter(pk=user_id).first()
    if not profile:
        raise ValidationError("Recipient profile not found")

    try:
        notification = UserNotification.objects.create(
            user_id=user_id,
            notification_type=str(notification_type),
            title=str(title),
            message=str(message),
            data=data if isinstance(data, dict) else {},
            event_key=event_key,
        )
    except IntegrityError:
        if not event_key:
            raise
        existing = UserNotification.objects.filter(event_key=event_key).first()
        if not existing:
            raise
        return {
            "status": "ALREADY_QUEUED",
            "notification_id": str(existing.id),
            "email_id": None,
        }

    email = None
    if send_email and str(profile.email or "").strip():
        safe_message = escape(str(message))
        email = NotificationEmail.objects.create(
            recipient=profile.email,
            subject=str(title),
            html_body=f"<p>{safe_message}</p>",
            template_type=email_template or "generic",
            status="pending",
        )

    return {
        "status": "QUEUED",
        "notification_id": str(notification.id),
        "email_id": str(email.id) if email else None,
    }
