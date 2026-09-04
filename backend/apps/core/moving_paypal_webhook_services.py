from decimal import Decimal
import json

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from .domain_bookings import MovingDispute, MovingPayment
from .domain_platform import PaymentWebhookEvent
from .moving_payment_services import (
    _booking,
    _money,
    _paypal_json,
    _paypal_token,
    _require_invoice,
    _settle_payment,
    _verify_paypal_webhook,
)


@transaction.atomic
def finalize_moving_paypal_webhook(*, headers, raw_body):
    if not _verify_paypal_webhook(headers, raw_body):
        raise PermissionError("Invalid PayPal webhook signature")

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError as exc:
        raise ValidationError("Invalid webhook JSON") from exc

    event_id = event.get("id")
    event_type = event.get("event_type")
    resource = event.get("resource") or {}
    if not event_id:
        raise ValidationError("Missing PayPal event id")

    hook = PaymentWebhookEvent.objects.select_for_update().filter(
        provider="PAYPAL_MOVING",
        event_id=event_id,
    ).first()
    if hook and hook.status == "PROCESSED":
        return {"success": True, "status": "ALREADY_PROCESSED", "event_id": event_id}
    if not hook:
        hook = PaymentWebhookEvent.objects.create(
            provider="PAYPAL_MOVING",
            event_id=event_id,
            event_type=event_type or "",
            status="PROCESSING",
            metadata=event,
        )
    else:
        hook.status = "PROCESSING"
        hook.event_type = event_type or hook.event_type
        hook.metadata = event
        hook.error = None
        hook.save(update_fields=["status", "event_type", "metadata", "error"])

    supplementary = resource.get("supplementary_data") or {}
    related_ids = supplementary.get("related_ids") or {}
    capture_id = resource.get("id")

    # PayPal capture webhooks carry the capture id in resource.id, while the
    # checkout order id is in supplementary_data.related_ids.order_id. The
    # payment record stores the checkout order id as provider_reference.
    if event_type and event_type.startswith("PAYMENT.CAPTURE."):
        order_id = related_ids.get("order_id") or capture_id
    else:
        order_id = resource.get("id") or related_ids.get("order_id")

    payment = None
    if order_id:
        payment = MovingPayment.objects.select_for_update().filter(
            provider="PAYPAL",
            provider_reference=order_id,
        ).first()

    if payment is None:
        hook.status = "IGNORED"
        hook.processed_at = timezone.now()
        hook.save(update_fields=["status", "processed_at"])
        return {
            "success": True,
            "status": "IGNORED",
            "reason": "Moving payment not found",
            "event_id": event_id,
        }

    completed = {"PAYMENT.CAPTURE.COMPLETED", "CHECKOUT.ORDER.COMPLETED"}
    failed = {
        "PAYMENT.CAPTURE.DENIED",
        "PAYMENT.CAPTURE.DECLINED",
        "CHECKOUT.ORDER.VOIDED",
    }

    if event_type in completed:
        amount = Decimal(
            str(
                resource.get("amount", {}).get("value")
                or resource.get("purchase_units", [{}])[0]
                .get("payments", {})
                .get("captures", [{}])[0]
                .get("amount", {})
                .get("value")
                or resource.get("purchase_units", [{}])[0]
                .get("amount", {})
                .get("value")
                or 0
            )
        )
        if event_type == "CHECKOUT.ORDER.COMPLETED" and amount <= 0:
            token = _paypal_token()
            order = _paypal_json(f"/v2/checkout/orders/{order_id}", token=token)
            amount = Decimal(
                str(
                    order.get("purchase_units", [{}])[0]
                    .get("payments", {})
                    .get("captures", [{}])[0]
                    .get("amount", {})
                    .get("value")
                    or order.get("purchase_units", [{}])[0]
                    .get("amount", {})
                    .get("value")
                    or 0
                )
            )

        if amount <= 0 or payment.provider_amount is None or _money(payment.provider_amount) != _money(amount):
            raise ValidationError("PayPal amount does not match stored payment")

        transaction_id = capture_id or (
            ((resource.get("purchase_units") or [{}])[0].get("payments") or {})
            .get("captures") or [{}]
        )[0].get("id") or order_id

        booking = _booking(payment.booking_id)
        invoice = _require_invoice(booking)
        result = _settle_payment(
            payment,
            booking,
            invoice,
            provider_transaction_id=transaction_id,
            provider_currency="USD",
            provider_amount=amount,
            paypal_order_id=order_id,
        )
        hook.status = "PROCESSED"
        hook.processed_at = timezone.now()
        hook.save(update_fields=["status", "processed_at"])
        return {"success": True, **result, "event_id": event_id}

    if event_type in failed:
        payment.status = "FAILED"
        payment.save(update_fields=["status", "updated_at"])

    hook.status = "PROCESSED"
    hook.processed_at = timezone.now()
    hook.save(update_fields=["status", "processed_at"])
    return {
        "success": True,
        "status": "PROCESSED",
        "event_type": event_type,
        "payment_id": str(payment.id),
        "event_id": event_id,
    }
