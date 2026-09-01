from decimal import Decimal
import uuid

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import Profile
from apps.payments.services import get_provider

from .domain_bookings import Booking, MoverPayout, MovingInvoice, MovingPayment
from .domain_platform import Mover, UserNotification

TWOPLACES = Decimal("0.01")


def _money(value):
    return Decimal(value or 0).quantize(TWOPLACES)


def _booking(booking_id):
    booking = Booking.objects.select_for_update().filter(pk=booking_id).first()
    if booking is None:
        raise ValidationError("Booking not found")
    return booking


def _invoice_number():
    return f"SK-MOV-{timezone.now():%Y%m%d}-{uuid.uuid4().hex[:8].upper()}"


def _ensure_invoice(booking, *, provider=None, provider_reference=None):
    invoice = MovingInvoice.objects.filter(booking_id=booking.id).first()
    if invoice:
        return invoice
    mover = Mover.objects.filter(pk=booking.mover_id).first()
    if mover is None:
        raise ValidationError("Mover not found")
    fee = _money(booking.commission_amount)
    return MovingInvoice.objects.create(
        booking_id=booking.id, invoice_number=_invoice_number(),
        renter_id=booking.renter_id, mover_id=booking.mover_id,
        amount_kes=_money(booking.total_amount), platform_fee_kes=fee,
        mover_net_kes=_money(booking.total_amount - fee), currency="KES",
        status="ISSUED", payment_provider=provider,
        provider_reference=provider_reference,
        mover_name_snapshot=mover.driver_full_name or "",
        mover_phone_snapshot=mover.phone, vehicle_type_snapshot=mover.vehicle_type,
        number_plate_snapshot=mover.number_plate,
        mover_profile_photo_snapshot=mover.profile_photo_url,
    )


def _ensure_payout(booking, mover):
    payout, _ = MoverPayout.objects.get_or_create(
        booking_id=booking.id,
        defaults={
            "mover_id": booking.mover_id,
            "mover_name": mover.driver_full_name or "",
            "national_id": mover.national_id or "",
            "payment_channel": mover.payment_channel,
            "renter_payment": _money(booking.total_amount),
            "platform_deduction": _money(booking.commission_amount),
            "net_mover_payable": _money(booking.total_amount - booking.commission_amount),
            "down_payment_amount": _money(booking.total_amount),
            "final_payment_amount": Decimal("0.00"),
            "down_payment_status": "held",
            "final_payment_status": "held",
        },
    )
    return payout


@transaction.atomic
def start_moving_mpesa_payment(*, renter_id, booking_id, phone_number):
    booking = _booking(booking_id)
    if booking.renter_id != renter_id:
        raise ValidationError("Booking not found or unauthorized")
    if booking.status != "confirmed":
        raise ValidationError("Booking must be confirmed before payment")
    if booking.payment_status == "paid":
        raise ValidationError("Booking is already paid")
    if not str(phone_number or "").strip():
        raise ValidationError("M-Pesa phone number is required")

    pending = MovingPayment.objects.select_for_update().filter(
        booking_id=booking.id, provider="MPESA", status__in=["PENDING", "PROCESSING"]
    ).order_by("-created_at").first()
    if pending and pending.provider_reference:
        return {"success": True, "booking_id": str(booking.id), "payment_id": str(pending.id),
                "invoice_id": str(pending.invoice_id), "provider": "mpesa",
                "provider_reference": pending.provider_reference, "status": pending.status,
                "message": "An M-Pesa payment request is already pending."}

    invoice = _ensure_invoice(booking, provider="MPESA")
    result = get_provider("mpesa").create_payment(
        amount=_money(booking.total_amount), currency="KES", reference=str(booking.id),
        metadata={"phone_number": str(phone_number), "description": "SakaKrib moving payment"},
    )
    if not result.success or not result.provider_reference:
        raise ValidationError(result.message or "Unable to start M-Pesa payment")

    invoice.payment_provider = "MPESA"
    invoice.provider_reference = result.provider_reference
    invoice.save(update_fields=["payment_provider", "provider_reference", "updated_at"])
    payment = MovingPayment.objects.create(
        booking_id=booking.id, invoice_id=invoice.id, payer_id=renter_id,
        amount_kes=_money(booking.total_amount), provider="MPESA", status="PENDING",
        provider_reference=result.provider_reference, provider_amount=_money(booking.total_amount),
        provider_currency="KES",
    )
    return {"success": True, "booking_id": str(booking.id), "payment_id": str(payment.id),
            "invoice_id": str(invoice.id), "provider": "mpesa",
            "provider_reference": result.provider_reference, "status": "PENDING",
            "message": result.message, "provider_response": result.raw}


@transaction.atomic
def finalize_moving_mpesa_callback(*, checkout_request_id, result_code, result_description,
                                      callback_metadata=None, merchant_request_id=None):
    payment = MovingPayment.objects.select_for_update().filter(
        provider="MPESA", provider_reference=checkout_request_id
    ).first()
    if payment is None:
        return {"status": "IGNORED", "reason": "Unknown payment reference"}
    booking = _booking(payment.booking_id)
    invoice = MovingInvoice.objects.select_for_update().get(pk=payment.invoice_id)

    if payment.status in {"HELD", "RELEASED"}:
        return {"status": "ALREADY_PROCESSED", "payment_id": str(payment.id)}
    if int(result_code or 1) != 0:
        payment.status = "FAILED"
        payment.provider_currency = "KES"
        payment.save(update_fields=["status", "provider_currency", "updated_at"])
        return {"status": "FAILED", "payment_id": str(payment.id)}

    items = callback_metadata or {}
    amount = _money(items.get("Amount"))
    receipt = items.get("MpesaReceiptNumber")
    if amount != _money(booking.total_amount):
        payment.status = "FAILED"
        payment.save(update_fields=["status", "updated_at"])
        raise ValidationError("M-Pesa amount does not match booking total")
    if not receipt:
        raise ValidationError("M-Pesa receipt is missing")

    now = timezone.now()
    payment.status = "HELD"
    payment.paid_at = now
    payment.mpesa_receipt = receipt
    payment.provider_transaction_id = receipt
    payment.provider_amount = amount
    payment.provider_currency = "KES"
    payment.save(update_fields=["status", "paid_at", "mpesa_receipt", "provider_transaction_id", "provider_amount", "provider_currency", "updated_at"])

    invoice.status = "PAID"
    invoice.payment_provider = "MPESA"
    invoice.provider_reference = checkout_request_id
    invoice.provider_transaction_id = receipt
    invoice.paid_at = now
    invoice.save(update_fields=["status", "payment_provider", "provider_reference", "provider_transaction_id", "paid_at", "updated_at"])

    booking.payment_status = "paid"
    booking.payment_method = "mpesa"
    booking.updated_at = now
    booking.save(update_fields=["payment_status", "payment_method", "updated_at"])

    mover = Mover.objects.filter(pk=booking.mover_id).first()
    if mover is None:
        raise ValidationError("Mover not found")
    _ensure_payout(booking, mover)

    for user_id, title, message in [
        (booking.renter_id, "Moving payment received", "Your moving payment was received and is being held until delivery is confirmed."),
        (mover.user_id, "Renter paid for the move", "The renter has paid. Funds remain held until the delivery conditions are satisfied."),
    ]:
        UserNotification.objects.create(
            user_id=user_id, notification_type="MOVING_PAYMENT_PAID",
            title=title, message=message,
            data={"booking_id": str(booking.id), "invoice_id": str(invoice.id), "invoice_number": invoice.invoice_number},
        )
    return {"status": "HELD", "payment_id": str(payment.id), "invoice_id": str(invoice.id), "booking_id": str(booking.id)}


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
