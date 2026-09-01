from decimal import Decimal
import base64
import json
import urllib.parse
import urllib.request
import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import Profile
from apps.payments.services import get_provider

from .domain_bookings import Booking, MoverPayout, MovingInvoice, MovingPayment
from .domain_platform import Mover, PaymentWebhookEvent, UserNotification

TWOPLACES = Decimal("0.01")


def _money(value):
    return Decimal(str(value or 0)).quantize(TWOPLACES)


def _booking(booking_id):
    booking = Booking.objects.select_for_update().filter(pk=booking_id).first()
    if booking is None:
        raise ValidationError("Booking not found")
    return booking


def _invoice_number():
    return f"SK-MOV-{timezone.now():%Y%m%d}-{uuid.uuid4().hex[:8].upper()}"


def _require_invoice(booking):
    invoice = MovingInvoice.objects.select_for_update().filter(booking_id=booking.id).first()
    if invoice is None or _money(invoice.amount_kes) != _money(booking.total_amount):
        raise ValidationError("Valid moving invoice is required")
    return invoice


def _ensure_payout(booking, mover):
    fee = _money(booking.commission_amount)
    payout, _ = MoverPayout.objects.get_or_create(
        booking_id=booking.id,
        defaults={
            "mover_id": booking.mover_id,
            "mover_name": mover.driver_full_name or "",
            "national_id": mover.national_id or "",
            "payment_channel": mover.payment_channel,
            "renter_payment": _money(booking.total_amount),
            "platform_deduction": fee,
            "net_mover_payable": _money(booking.total_amount - fee),
            "down_payment_amount": _money(booking.total_amount),
            "final_payment_amount": Decimal("0.00"),
            "down_payment_status": "held",
            "final_payment_status": "held",
        },
    )
    return payout


def _settle_payment(payment, booking, invoice, *, provider_transaction_id, provider_currency, provider_amount, mpesa_receipt=None, paypal_order_id=None):
    if payment.status in {"HELD", "RELEASED"}:
        return {"status": "ALREADY_PROCESSED", "payment_id": str(payment.id), "invoice_id": str(invoice.id)}

    amount_kes = _money(payment.amount_kes)
    if amount_kes != _money(booking.total_amount):
        payment.status = "FAILED"
        payment.save(update_fields=["status", "updated_at"])
        raise ValidationError("Payment amount does not match booking total")

    now = timezone.now()
    payment.status = "HELD"
    payment.paid_at = now
    payment.provider_transaction_id = str(provider_transaction_id) if provider_transaction_id else payment.provider_transaction_id
    payment.provider_amount = _money(provider_amount)
    payment.provider_currency = provider_currency
    if mpesa_receipt:
        payment.mpesa_receipt = str(mpesa_receipt)
    if paypal_order_id:
        payment.paypal_order_id = str(paypal_order_id)
    payment.save(update_fields=[
        "status", "paid_at", "provider_transaction_id", "provider_amount",
        "provider_currency", "mpesa_receipt", "paypal_order_id", "updated_at",
    ])

    invoice.status = "PAID"
    invoice.payment_provider = payment.provider
    invoice.provider_reference = payment.provider_reference
    invoice.provider_transaction_id = payment.provider_transaction_id
    invoice.paid_at = now
    invoice.save(update_fields=[
        "status", "payment_provider", "provider_reference",
        "provider_transaction_id", "paid_at", "updated_at",
    ])

    booking.payment_status = "paid"
    booking.payment_method = payment.provider.lower()
    booking.updated_at = now
    booking.save(update_fields=["payment_status", "payment_method", "updated_at"])

    mover = Mover.objects.filter(pk=booking.mover_id).first()
    if mover is None:
        raise ValidationError("Mover not found")
    payout = _ensure_payout(booking, mover)

    for user_id, title, message in [
        (booking.renter_id, "Moving payment received", "Your moving payment was received and is being held securely until delivery is confirmed."),
        (mover.user_id, "Renter paid for the move", "The renter has paid. The funds will be released after safe delivery is confirmed."),
    ]:
        UserNotification.objects.create(
            user_id=user_id,
            notification_type="MOVING_PAYMENT_PAID",
            title=title,
            message=message,
            data={"booking_id": str(booking.id), "invoice_id": str(invoice.id), "invoice_number": invoice.invoice_number},
        )

    return {
        "status": "HELD",
        "payment_id": str(payment.id),
        "invoice_id": str(invoice.id),
        "booking_id": str(booking.id),
        "payout_id": str(payout.id),
    }


@transaction.atomic
def start_moving_mpesa_payment(*, renter_id, booking_id, phone_number=None):
    booking = _booking(booking_id)
    if booking.renter_id != renter_id:
        raise ValidationError("Booking not found")
    if booking.status != "confirmed":
        raise ValidationError("Booking must be confirmed before payment")
    if booking.payment_status == "paid":
        raise ValidationError("Booking is already paid")

    invoice = _require_invoice(booking)
    profile = Profile.objects.filter(pk=renter_id).first()
    phone = str(profile.phone or "").strip() if profile else ""
    if not phone:
        raise ValidationError("Profile phone number required")

    existing = MovingPayment.objects.select_for_update().filter(
        booking_id=booking.id, status__in=["PENDING", "PROCESSING", "HELD"]
    ).order_by("-created_at").first()
    if existing and existing.status == "HELD":
        raise ValidationError("Booking payment is already held")
    if existing and existing.provider != "MPESA":
        raise ValidationError("An active payment attempt exists for another provider")

    result = get_provider("mpesa").create_payment(
        amount=_money(booking.total_amount),
        currency="KES",
        reference=f"SAKACRIB-MOV-{str(booking.id)[:8]}",
        metadata={"phone_number": phone, "description": f"Saka Krib moving service {invoice.invoice_number}"},
    )
    if not result.success or not result.provider_reference:
        raise ValidationError(result.message or "Unable to start M-Pesa payment")

    if existing:
        existing.provider_reference = result.provider_reference
        existing.provider_amount = _money(booking.total_amount)
        existing.provider_currency = "KES"
        existing.status = "PROCESSING"
        existing.updated_at = timezone.now()
        existing.save(update_fields=["provider_reference", "provider_amount", "provider_currency", "status", "updated_at"])
        payment = existing
    else:
        payment = MovingPayment.objects.create(
            booking_id=booking.id,
            invoice_id=invoice.id,
            payer_id=renter_id,
            amount_kes=_money(booking.total_amount),
            provider="MPESA",
            status="PROCESSING",
            provider_reference=result.provider_reference,
            provider_amount=_money(booking.total_amount),
            provider_currency="KES",
        )

    return {
        "success": True,
        "booking_id": str(booking.id),
        "payment_id": str(payment.id),
        "invoice_id": str(invoice.id),
        "checkout_request_id": result.provider_reference,
        "amount_kes": _money(booking.total_amount),
        "status": "PROCESSING",
        "customer_message": result.message,
    }


@transaction.atomic
def finalize_moving_mpesa_callback(*, checkout_request_id, result_code, result_description, callback_metadata=None, merchant_request_id=None):
    payment = MovingPayment.objects.select_for_update().filter(
        provider="MPESA", provider_reference=checkout_request_id
    ).first()
    if payment is None:
        return {"status": "IGNORED", "reason": "Unknown payment reference"}

    if payment.status in {"HELD", "RELEASED"}:
        return {"status": "ALREADY_PROCESSED", "payment_id": str(payment.id)}

    if int(result_code or 1) != 0:
        payment.status = "FAILED"
        payment.provider_currency = "KES"
        payment.save(update_fields=["status", "provider_currency", "updated_at"])
        return {"status": "FAILED", "payment_id": str(payment.id), "result_code": result_code}

    booking = _booking(payment.booking_id)
    invoice = _require_invoice(booking)
    items = callback_metadata or {}
    receipt = items.get("MpesaReceiptNumber")
    amount = _money(items.get("Amount"))
    if not receipt:
        raise ValidationError("M-Pesa receipt is missing")
    if amount <= 0 or amount != _money(payment.amount_kes) or amount != _money(booking.total_amount):
        payment.status = "FAILED"
        payment.save(update_fields=["status", "updated_at"])
        raise ValidationError("M-Pesa amount does not match booking total")

    return _settle_payment(
        payment, booking, invoice,
        provider_transaction_id=receipt,
        provider_currency="KES",
        provider_amount=amount,
        mpesa_receipt=receipt,
    )


def _paypal_token():
    if not settings.PAYPAL_CLIENT_ID or not settings.PAYPAL_CLIENT_SECRET:
        raise RuntimeError("PayPal credentials are not configured")
    raw = f"{settings.PAYPAL_CLIENT_ID}:{settings.PAYPAL_CLIENT_SECRET}".encode()
    auth = base64.b64encode(raw).decode()
    body = urllib.parse.urlencode({"grant_type": "client_credentials"}).encode()
    request = urllib.request.Request(
        f"{settings.PAYPAL_BASE_URL}/v1/oauth2/token",
        data=body,
        method="POST",
        headers={"Authorization": f"Basic {auth}", "Content-Type": "application/x-www-form-urlencoded"},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            data = json.loads(response.read().decode())
    except Exception as exc:
        raise RuntimeError("Unable to authenticate with PayPal") from exc
    token = data.get("access_token")
    if not token:
        raise RuntimeError("PayPal access token missing")
    return token


def _paypal_json(path, *, method="GET", body=None, token=None):
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if body is not None:
        headers["Content-Type"] = "application/json"
    payload = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(
        f"{settings.PAYPAL_BASE_URL}{path}", data=payload, method=method, headers=headers
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode())
    except Exception as exc:
        raise RuntimeError("PayPal request failed") from exc


def _kes_usd_rate():
    api_key = getattr(settings, "EXCHANGE_RATE_API_KEY", "") or getattr(settings, "EXCHANGERATE_API_KEY", "")
    base_url = getattr(settings, "EXCHANGE_RATE_API_BASE_URL", "https://v6.exchangerate-api.com/v6")
    if not api_key:
        raise RuntimeError("Exchange-rate service is not configured")
    request = urllib.request.Request(f"{base_url}/{api_key}/pair/KES/USD", headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            data = json.loads(response.read().decode())
    except Exception as exc:
        raise RuntimeError("Unable to obtain current KES/USD exchange rate") from exc
    rate = Decimal(str(data.get("conversion_rate", 0)))
    if data.get("result") != "success" or rate <= 0:
        raise RuntimeError("Unable to obtain current KES/USD exchange rate")
    return rate


@transaction.atomic
def start_moving_paypal_payment(*, renter_id, booking_id):
    booking = _booking(booking_id)
    if booking.renter_id != renter_id:
        raise ValidationError("Booking not found")
    if booking.status != "confirmed":
        raise ValidationError("Booking must be confirmed before payment")
    if booking.payment_status == "paid":
        raise ValidationError("Booking is already paid")

    invoice = _require_invoice(booking)
    existing = MovingPayment.objects.select_for_update().filter(
        booking_id=booking.id, status__in=["PENDING", "PROCESSING", "HELD"]
    ).order_by("-created_at").first()
    if existing and existing.status == "HELD":
        raise ValidationError("Booking payment is already held")
    if existing and existing.provider != "PAYPAL":
        raise ValidationError("An active payment attempt already exists for another provider")
    if existing and existing.provider_reference and existing.provider_amount and existing.provider_currency == "USD":
        return {
            "success": True, "booking_id": str(booking.id), "order_id": existing.provider_reference,
            "amount_kes": _money(booking.total_amount), "amount_usd": _money(existing.provider_amount),
            "currency": "USD", "reused": True,
        }

    rate = _kes_usd_rate()
    usd = (_money(booking.total_amount) * rate).quantize(TWOPLACES)
    if usd <= 0:
        raise ValidationError("Invalid PayPal amount")

    token = _paypal_token()
    order = _paypal_json(
        "/v2/checkout/orders", method="POST", token=token,
        body={
            "intent": "CAPTURE",
            "purchase_units": [{
                "amount": {"currency_code": "USD", "value": f"{usd:.2f}"},
                "description": f"Saka Krib moving service {invoice.invoice_number}",
                "custom_id": f"moving:{booking.id}",
            }],
            "application_context": {"brand_name": "Saka Krib", "shipping_preference": "NO_SHIPPING", "user_action": "PAY_NOW"},
        },
    )
    order_id = order.get("id")
    if not order_id:
        raise ValidationError("PayPal did not return an order id")

    if existing:
        existing.provider_reference = order_id
        existing.paypal_order_id = order_id
        existing.provider_amount = usd
        existing.provider_currency = "USD"
        existing.status = "PENDING"
        existing.updated_at = timezone.now()
        existing.save(update_fields=["provider_reference", "paypal_order_id", "provider_amount", "provider_currency", "status", "updated_at"])
        payment = existing
    else:
        payment = MovingPayment.objects.create(
            booking_id=booking.id, invoice_id=invoice.id, payer_id=renter_id,
            amount_kes=_money(booking.total_amount), provider="PAYPAL", status="PENDING",
            provider_reference=order_id, paypal_order_id=order_id,
            provider_amount=usd, provider_currency="USD",
        )

    approval_url = next((link.get("href") for link in order.get("links", []) if link.get("rel") == "approve"), None)
    return {
        "success": True, "booking_id": str(booking.id), "payment_id": str(payment.id),
        "order_id": order_id, "amount_kes": _money(booking.total_amount),
        "amount_usd": usd, "currency": "USD", "fx_rate": rate,
        "approval_url": approval_url,
    }


def _verify_paypal_webhook(headers, raw_body):
    webhook_id = getattr(settings, "PAYPAL_WEBHOOK_ID", "") or getattr(settings, "MOVING_PAYPAL_WEBHOOK_ID", "")
    if not webhook_id:
        raise RuntimeError("PayPal webhook ID is not configured")
    required = {
        "transmission_id": headers.get("paypal-transmission-id"),
        "transmission_time": headers.get("paypal-transmission-time"),
        "cert_url": headers.get("paypal-cert-url"),
        "auth_algo": headers.get("paypal-auth-algo"),
        "transmission_sig": headers.get("paypal-transmission-sig"),
    }
    if not all(required.values()):
        return False
    token = _paypal_token()
    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        return False
    result = _paypal_json(
        "/v1/notifications/verify-webhook-signature",
        method="POST", token=token,
        body={**required, "webhook_id": webhook_id, "webhook_event": event},
    )
    return result.get("verification_status") == "SUCCESS"


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

    hook = PaymentWebhookEvent.objects.select_for_update().filter(provider="PAYPAL_MOVING", event_id=event_id).first()
    if hook and hook.status == "PROCESSED":
        return {"success": True, "status": "ALREADY_PROCESSED", "event_id": event_id}
    if not hook:
        hook = PaymentWebhookEvent.objects.create(
            provider="PAYPAL_MOVING", event_id=event_id, event_type=event_type or "",
            status="PROCESSING", metadata=event,
        )
    else:
        hook.status = "PROCESSING"
        hook.event_type = event_type or hook.event_type
        hook.metadata = event
        hook.error = None
        hook.save(update_fields=["status", "event_type", "metadata", "error"])

    order_id = resource.get("id") or ((resource.get("supplementary_data") or {}).get("related_ids") or {}).get("order_id")
    payment = MovingPayment.objects.select_for_update().filter(provider="PAYPAL", provider_reference=order_id).first() if order_id else None
    if payment is None:
        hook.status = "IGNORED"
        hook.processed_at = timezone.now()
        hook.save(update_fields=["status", "processed_at"])
        return {"success": True, "status": "IGNORED", "reason": "Moving payment not found", "event_id": event_id}

    completed = {"PAYMENT.CAPTURE.COMPLETED", "CHECKOUT.ORDER.COMPLETED"}
    failed = {"PAYMENT.CAPTURE.DENIED", "PAYMENT.CAPTURE.DECLINED", "CHECKOUT.ORDER.VOIDED"}

    if event_type in completed:
        amount_value = resource.get("amount", {}).get("value")
        if not amount_value:
            captures = ((resource.get("purchase_units") or [{}])[0].get("payments") or {}).get("captures") or []
            if captures:
                amount_value = (captures[0].get("amount") or {}).get("value")
        if not amount_value:
            amount_value = ((resource.get("purchase_units") or [{}])[0].get("amount") or {}).get("value")
        amount_usd = _money(amount_value)
        if amount_usd <= 0 or payment.provider_currency != "USD" or _money(payment.provider_amount) != amount_usd:
            raise ValidationError("PayPal amount does not match stored payment")

        booking = _booking(payment.booking_id)
        invoice = _require_invoice(booking)
        receipt = resource.get("id") or order_id
        result = _settle_payment(
            payment, booking, invoice,
            provider_transaction_id=receipt,
            provider_currency="USD",
            provider_amount=amount_usd,
            paypal_order_id=order_id,
        )
        hook.status = "PROCESSED"
        hook.processed_at = timezone.now()
        hook.save(update_fields=["status", "processed_at"])
        return {"success": True, **result, "event_id": event_id}

    if event_type in failed:
        payment.status = "FAILED"
        payment.updated_at = timezone.now()
        payment.save(update_fields=["status", "updated_at"])

    hook.status = "PROCESSED"
    hook.processed_at = timezone.now()
    hook.save(update_fields=["status", "processed_at"])
    return {"success": True, "status": "PROCESSED", "event_type": event_type, "payment_id": str(payment.id), "event_id": event_id}


@transaction.atomic
def release_moving_escrow(*, admin_user_id, booking_id):
    admin = Profile.objects.filter(pk=admin_user_id).first()
    if admin is None or admin.role != "admin":
        raise ValidationError("Admin authorization required")
    booking = _booking(booking_id)
    if booking.status == "cancelled":
        raise ValidationError("Cancelled booking cannot be released")
    if booking.payment_status != "paid":
        raise ValidationError("Renter payment is not settled")
    if booking.dispute_status == "OPEN":
        raise ValidationError("Escrow release blocked while dispute is open")
    if not booking.renter_confirmed_delivery_at or not booking.mover_confirmed_delivery_at:
        raise ValidationError("Both renter and mover must confirm safe delivery")

    payout = MoverPayout.objects.select_for_update().filter(booking_id=booking.id).first()
    if payout is None:
        raise ValidationError("Mover payout record not found")
    if payout.final_payment_status == "released":
        return {"status": "released", "already_processed": True, "payout_id": str(payout.id)}
    if payout.final_payment_status not in {"held", "failed"}:
        raise ValidationError("Final escrow is not available for release")

    now = timezone.now()
    released = MovingPayment.objects.filter(booking_id=booking.id, status="HELD").update(
        status="RELEASED", released_at=now, updated_at=now
    )
    payout.final_payment_status = "processing"
    payout.final_payment_released_at = payout.final_payment_released_at or now
    payout.delivery_confirmed_at = payout.delivery_confirmed_at or now
    payout.payout_requested_at = payout.payout_requested_at or now
    payout.payout_failure_reason = None
    payout.save(update_fields=["final_payment_status", "final_payment_released_at", "delivery_confirmed_at", "payout_requested_at", "payout_failure_reason", "updated_at"])

    invoice = MovingInvoice.objects.select_for_update().filter(booking_id=booking.id).first()
    if invoice:
        invoice.status = "RELEASED"
        invoice.released_at = invoice.released_at or now
        invoice.save(update_fields=["status", "released_at", "updated_at"])
    return {"status": "PAYOUT_PROCESSING", "escrow_released": True,
            "payments_released": released, "payout_id": str(payout.id),
            "mover_net_payable": payout.net_mover_payable,
            "next_step": "PAYOUT_PROVIDER_CALLBACK"}
