import json
import logging

from django.core.exceptions import ValidationError
from django.core.serializers.json import DjangoJSONEncoder
from django.db import IntegrityError, transaction
from django.utils.html import escape

from apps.accounts.models import Profile

from .domain_platform import NotificationEmail, UserNotification
from .email_services import queue_email
from .email_templates import EMAIL_TEMPLATES
from .subscription_email_templates import SUBSCRIPTION_EMAIL_TEMPLATES, SUBSCRIPTION_EMAIL_SUBJECTS

logger = logging.getLogger(__name__)


def _enrich_subscription_email_payload(payload):
    """Fill subscription email fields from the authoritative paid invoice record."""
    data = dict(payload or {})
    invoice_id = data.get("invoice_id") or data.get("id")
    if not invoice_id:
        return data

    try:
        from apps.subscriptions.models import (
            LandlordSubscription,
            RealEstateSubscription,
            SubscriptionInvoice,
            SubscriptionPlan,
        )

        invoice = SubscriptionInvoice.objects.filter(pk=invoice_id).first()
        if not invoice:
            return data

        # Only a successfully paid invoice is authoritative for payment-confirmation
        # email details. Failed/pending events keep their existing event payload.
        if str(invoice.status or "").upper() != "PAID":
            return data

        subscription = None
        if invoice.landlord_subscription_id:
            subscription = LandlordSubscription.objects.filter(
                pk=invoice.landlord_subscription_id
            ).first()
        elif invoice.real_estate_subscription_id:
            subscription = RealEstateSubscription.objects.filter(
                pk=invoice.real_estate_subscription_id
            ).first()

        plan = None
        if invoice.upgrade_plan_id:
            plan = SubscriptionPlan.objects.filter(pk=invoice.upgrade_plan_id).first()
        elif subscription:
            plan = SubscriptionPlan.objects.filter(pk=subscription.plan_id).first()

        billing_cycle = (
            invoice.upgrade_billing_cycle
            or (subscription.billing_cycle if subscription else None)
        )

        # The invoice is the source of truth for values that payment providers
        # do not return as part of their success webhook.
        data.update(
            {
                "plan_name": plan.name if plan else data.get("plan_name"),
                "billing_cycle": billing_cycle or data.get("billing_cycle"),
                "amount_kes": invoice.amount_kes,
                "amount_usd": invoice.amount_usd,
                "provider": invoice.payment_provider or data.get("provider"),
                "provider_reference": invoice.provider_reference,
                "provider_transaction_id": invoice.provider_transaction_id,
                "payment_method": invoice.payment_method,
                "billing_period_start": invoice.billing_period_start,
                "billing_period_end": invoice.billing_period_end,
            }
        )

        if subscription:
            data.setdefault("subscription_status", subscription.status)

        if invoice.upgrade_plan_id:
            data.setdefault(
                "target_plan_name",
                plan.name if plan else data.get("plan_name"),
            )
            if subscription:
                current_plan = SubscriptionPlan.objects.filter(
                    pk=subscription.plan_id
                ).first()
                data.setdefault(
                    "current_plan_name",
                    current_plan.name if current_plan else None,
                )

        start = invoice.billing_period_start
        end = invoice.billing_period_end
        if start or end:
            data["billing_period"] = f"{start or 'N/A'} – {end or 'N/A'}"

    except Exception:
        logger.exception(
            "Unable to enrich subscription email from paid invoice",
            extra={"invoice_id": str(invoice_id)},
        )
        return data

    return data


def _json_safe_payload(payload):
    """Convert Django-native values such as Decimal and datetime to JSON-safe values."""
    return json.loads(json.dumps(payload or {}, cls=DjangoJSONEncoder))


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
        with transaction.atomic():
            notification = UserNotification.objects.create(
                user_id=user_id,
                notification_type=str(notification_type),
                title=str(title),
                message=str(message),
                data=_json_safe_payload(data if isinstance(data, dict) else {}),
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
        template_type = str(email_template or "generic").strip()
        payload = dict(data or {})
        payload.setdefault("email", profile.email)
        payload.setdefault("full_name", getattr(profile, "full_name", ""))
        if template_type in SUBSCRIPTION_EMAIL_TEMPLATES:
            payload = _enrich_subscription_email_payload(payload)
            html_body = SUBSCRIPTION_EMAIL_TEMPLATES[template_type](payload)
            email = NotificationEmail.objects.create(
                recipient=profile.email,
                subject=SUBSCRIPTION_EMAIL_SUBJECTS.get(template_type, title),
                html_body=html_body,
                template_type=template_type,
                status="pending",
            )
        elif template_type in EMAIL_TEMPLATES:
            email = queue_email(
                recipient=profile.email,
                template_type=template_type,
                payload=payload,
            )
        else:
            email = NotificationEmail.objects.create(
                recipient=profile.email,
                subject=str(title),
                html_body=f"<p>{escape(str(message))}</p>",
                template_type=template_type,
                status="pending",
            )

    return {
        "status": "QUEUED",
        "notification_id": str(notification.id),
        "email_id": str(email.id) if email else None,
    }
