from django.core.mail import EmailMultiAlternatives
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.core.domain_platform import NotificationEmail


class Command(BaseCommand):
    help = "Send pending SakaKrib notification emails"

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=50)

    def handle(self, *args, **options):
        limit = max(1, min(options["limit"], 200))
        sent = failed = 0
        ids = list(
            NotificationEmail.objects.filter(status="pending")
            .order_by("created_at")
            .values_list("id", flat=True)[:limit]
        )
        for email_id in ids:
            try:
                with transaction.atomic():
                    row = NotificationEmail.objects.select_for_update().get(pk=email_id)
                    if row.status != "pending":
                        continue
                    msg = EmailMultiAlternatives(
                        subject=row.subject,
                        body="Please view this notification in the SakaKrib application.",
                        from_email=None,
                        to=[row.recipient],
                    )
                    msg.attach_alternative(row.html_body, "text/html")
                    msg.send(fail_silently=False)
                    row.status = "sent"
                    row.sent_at = timezone.now()
                    row.save(update_fields=["status", "sent_at"])
                    sent += 1
            except Exception as exc:
                NotificationEmail.objects.filter(pk=email_id, status="pending").update(status="failed")
                failed += 1
                self.stderr.write(f"Notification email {email_id} failed: {exc}")

        self.stdout.write(self.style.SUCCESS(f"Processed notification emails: sent={sent}, failed={failed}"))
