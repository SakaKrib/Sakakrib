import calendar
from datetime import date, datetime, time, timedelta

from celery import shared_task
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.accounts.models import Profile
from apps.listings.models import Listing

from .domain_property import PropertyUnit, RenterUnitAssociation
from .domain_platform import NotificationEmail
from .domain_rent import RentPayment, RentReminder, RentReminderSetting
from .notification_services import dispatch_user_notification


AUTOMATED_REMINDER_STATUSES = {"PENDING"}
SUPPORTED_REMINDER_CHANNELS = {"IN_APP", "EMAIL"}


def _month_start(value: date) -> date:
    return value.replace(day=1)


def _add_months(value: date, months: int) -> date:
    index = value.year * 12 + value.month - 1 + months
    year, month_index = divmod(index, 12)
    return date(year, month_index + 1, 1)


def _due_date(period_start: date, due_day: int) -> date:
    last_day = calendar.monthrange(period_start.year, period_start.month)[1]
    return period_start.replace(day=min(max(int(due_day or 1), 1), last_day))


def _scheduled_for(due_date: date, offset_days: int) -> datetime:
    scheduled_date = due_date - timedelta(days=int(offset_days))
    # Reminder offsets are date based; dispatch at the start of the Nairobi day.
    naive = datetime.combine(scheduled_date, time.min)
    return timezone.make_aware(naive, timezone.get_current_timezone())


def _period_is_paid(assoc_id, year: int, month: int) -> bool:
    return RentPayment.objects.filter(
        renter_assoc_id=assoc_id,
        period_year=year,
        period_month=month,
        status__iexact="PAID",
    ).exists()


def _build_default_message(assoc: RenterUnitAssociation, unit: PropertyUnit, listing: Listing, due_date: date) -> str:
    return (
        f"Rent of KES {unit.rent} for {listing.title or 'your property'} - "
        f"Unit {unit.unit_number} is due on {due_date.isoformat()}."
    )


@shared_task(bind=True, autoretry_for=(Exception,), retry_backoff=True, retry_kwargs={"max_retries": 3})
def generate_recurring_rent_reminders(self):
    """Materialize upcoming recurring reminders without sending them.

    Current and next monthly periods are materialized so that pre-due offsets
    (for example 7 or 3 days before due date) exist before their dispatch time.
    Existing rows are protected by the database uniqueness constraint.
    """
    today = timezone.localdate()
    periods = [_month_start(today), _add_months(_month_start(today), 1)]
    created = 0

    settings_qs = RentReminderSetting.objects.filter(enabled=True, recurring=True)
    for setting in settings_qs.iterator():
        assoc = RenterUnitAssociation.objects.filter(
            id=setting.renter_assoc_id,
            landlord_id=setting.landlord_id,
            status__iexact="ACTIVE",
        ).first()
        if not assoc:
            continue

        unit = PropertyUnit.objects.filter(id=assoc.unit_id, user_id=assoc.landlord_id).first()
        if not unit or not unit.payment_tracking_enabled or not assoc.renter_user_id:
            continue

        # Do not generate periods outside the association's lease.
        for period_start in periods:
            if assoc.lease_start and period_start < _month_start(assoc.lease_start):
                continue
            if assoc.lease_end and period_start > _month_start(assoc.lease_end):
                continue

            due_date = _due_date(period_start, unit.rent_due_day)
            message = (setting.custom_message or "").strip() or _build_default_message(
                assoc, unit, Listing.objects.filter(id=unit.listing_id).first() or Listing(title=""), due_date
            )

            for raw_offset in setting.offsets_days or []:
                try:
                    offset = int(raw_offset)
                except (TypeError, ValueError):
                    continue

                scheduled_for = _scheduled_for(due_date, offset)
                for raw_channel in setting.channels or ["IN_APP"]:
                    channel = str(raw_channel).strip().upper()
                    if channel not in SUPPORTED_REMINDER_CHANNELS:
                        continue
                    try:
                        _, was_created = RentReminder.objects.get_or_create(
                            renter_assoc_id=assoc.id,
                            landlord_id=assoc.landlord_id,
                            payment_period_year=period_start.year,
                            payment_period_month=period_start.month,
                            due_date=due_date,
                            scheduled_for=scheduled_for,
                            offset_days=offset,
                            channel=channel,
                            defaults={"message": message, "status": "PENDING"},
                        )
                        created += int(was_created)
                    except IntegrityError:
                        # Another worker may have created the same unique reminder.
                        continue

    return {"success": True, "created": created, "processed_at": timezone.now().isoformat()}


@shared_task(bind=True, autoretry_for=(Exception,), retry_backoff=True, retry_kwargs={"max_retries": 3})
def process_due_rent_reminders(self, batch_size: int = 200):
    """Dispatch due reminders idempotently and cancel reminders for paid periods."""
    now = timezone.now()
    processed = sent = cancelled = failed = 0

    due_ids = list(
        RentReminder.objects.filter(
            status__in=AUTOMATED_REMINDER_STATUSES,
            scheduled_for__lte=now,
        )
        .order_by("scheduled_for", "created_at")
        .values_list("id", flat=True)[:batch_size]
    )

    for reminder_id in due_ids:
        processed += 1
        try:
            with transaction.atomic():
                reminder = RentReminder.objects.select_for_update().get(id=reminder_id)
                if reminder.status != "PENDING":
                    continue

                assoc = RenterUnitAssociation.objects.filter(
                    id=reminder.renter_assoc_id,
                    landlord_id=reminder.landlord_id,
                    status__iexact="ACTIVE",
                ).first()
                if not assoc or not assoc.renter_user_id:
                    # Leave pending so a renter who claims the account later can
                    # still receive an overdue reminder.
                    continue

                if _period_is_paid(
                    assoc.id,
                    reminder.payment_period_year,
                    reminder.payment_period_month,
                ):
                    reminder.status = "CANCELLED"
                    reminder.failure_reason = "Billing period is already paid"
                    reminder.failed_at = now
                    reminder.save(update_fields=["status", "failure_reason", "failed_at"])
                    cancelled += 1
                    continue

                setting = RentReminderSetting.objects.filter(
                    renter_assoc_id=assoc.id,
                    landlord_id=assoc.landlord_id,
                ).first()
                if not setting or not setting.enabled or not setting.recurring:
                    reminder.status = "CANCELLED"
                    reminder.failure_reason = "Recurring reminders are disabled"
                    reminder.failed_at = now
                    reminder.save(update_fields=["status", "failure_reason", "failed_at"])
                    cancelled += 1
                    continue

                profile = Profile.objects.filter(pk=assoc.renter_user_id).first()
                if not profile:
                    reminder.status = "FAILED"
                    reminder.failure_reason = "Renter profile not found"
                    reminder.failed_at = now
                    reminder.save(update_fields=["status", "failure_reason", "failed_at"])
                    failed += 1
                    continue

                event_key = f"rent_reminder:{reminder.id}"
                channel = reminder.channel.upper()

                if channel == "IN_APP":
                    dispatch_user_notification(
                        user_id=assoc.renter_user_id,
                        notification_type="PAYMENT_REMINDER",
                        title="Rent payment reminder",
                        message=reminder.message,
                        data={
                            "association_id": str(assoc.id),
                            "unit_id": str(assoc.unit_id),
                            "payment_period_year": reminder.payment_period_year,
                            "payment_period_month": reminder.payment_period_month,
                            "due_date": reminder.due_date.isoformat(),
                            "reminder_id": str(reminder.id),
                        },
                        event_key=event_key,
                        send_email=False,
                        email_template="payment_reminder",
                    )
                elif channel == "EMAIL":
                    NotificationEmail.objects.get_or_create(
                        recipient=profile.email,
                        subject="Rent payment reminder",
                        html_body=f"<p>{reminder.message}</p>",
                        template_type="payment_reminder",
                        defaults={"status": "pending"},
                    )

                reminder.status = "SENT"
                reminder.sent_at = now
                reminder.delivered_at = now
                reminder.save(update_fields=["status", "sent_at", "delivered_at"])
                sent += 1
        except Exception as exc:
            try:
                with transaction.atomic():
                    reminder = RentReminder.objects.select_for_update().get(id=reminder_id)
                    if reminder.status == "PENDING":
                        reminder.status = "FAILED"
                        reminder.failed_at = timezone.now()
                        reminder.failure_reason = str(exc)[:1000]
                        reminder.save(update_fields=["status", "failed_at", "failure_reason"])
                        failed += 1
            except Exception:
                pass

    return {
        "success": True,
        "processed": processed,
        "sent": sent,
        "cancelled": cancelled,
        "failed": failed,
        "processed_at": timezone.now().isoformat(),
    }
