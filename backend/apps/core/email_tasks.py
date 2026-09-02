from celery import shared_task
from django.db import transaction
from django.utils import timezone

from .domain_platform import NotificationEmail
from .email_services import send_notification_email


@shared_task(bind=True, autoretry_for=(), max_retries=0)
def process_notification_email_queue(self, batch_size: int = 25):
    """Send pending notification emails through Resend.

    Rows remain in the production-compatible pending/sent/failed state model.
    A row is locked while its provider request is made so two workers cannot
    send the same notification concurrently.
    """
    pending_ids = list(
        NotificationEmail.objects.filter(status="pending")
        .order_by("created_at", "id")
        .values_list("id", flat=True)[:batch_size]
    )

    sent = failed = 0
    for email_id in pending_ids:
        try:
            with transaction.atomic():
                email = NotificationEmail.objects.select_for_update().filter(
                    id=email_id,
                    status="pending",
                ).first()
                if not email:
                    continue

                try:
                    send_notification_email(email)
                    sent += 1
                except Exception as exc:
                    email.status = "failed"
                    email.save(update_fields=["status"])
                    failed += 1
        except Exception:
            failed += 1

    return {
        "success": True,
        "sent": sent,
        "failed": failed,
        "total": len(pending_ids),
        "processed_at": timezone.now().isoformat(),
    }
