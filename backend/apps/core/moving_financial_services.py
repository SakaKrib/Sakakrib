from decimal import Decimal
import uuid

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from .domain_bookings import Booking, MovingInvoice, MovingPayment
from .domain_financial import MovingFinancialDocument
from .domain_platform import Mover

TWOPLACES = Decimal("0.01")


def _money(value):
    return Decimal(str(value or 0)).quantize(TWOPLACES)


def _document_number(prefix):
    return f"{prefix}-{timezone.now():%Y%m%d}-{uuid.uuid4().hex[:10].upper()}"


@transaction.atomic
def ensure_moving_financial_documents(*, payment_id):
    """Create or synchronize the two auditable financial documents for a payment.

    Escrow release changes the payment lifecycle to RELEASED, but that only
    authorizes the mover payout. The mover settlement becomes RELEASED only
    after the payout provider confirms the actual transfer.
    """
    payment = MovingPayment.objects.select_for_update().filter(pk=payment_id).first()
    if payment is None:
        raise ValidationError("Moving payment not found")
    if payment.status not in {"HELD", "RELEASED"}:
        raise ValidationError("Financial documents require a successfully held payment")

    booking = Booking.objects.select_for_update().filter(pk=payment.booking_id).first()
    if booking is None:
        raise ValidationError("Booking not found")

    invoice = MovingInvoice.objects.select_for_update().filter(pk=payment.invoice_id).first()
    if invoice is None:
        raise ValidationError("Moving invoice not found")

    mover = Mover.objects.filter(pk=booking.mover_id).first()
    if mover is None:
        raise ValidationError("Mover not found")

    amount = _money(payment.amount_kes)
    platform_fee = _money(booking.commission_amount)
    mover_net = _money(amount - platform_fee)
    if mover_net < 0:
        raise ValidationError("Mover settlement cannot be negative")

    now = timezone.now()
    common = {
        "booking_id": booking.id,
        "payment_id": payment.id,
        "renter_id": booking.renter_id,
        "mover_id": booking.mover_id,
        "currency": "KES",
        "payment_provider": payment.provider,
        "provider_reference": payment.provider_reference,
        "provider_transaction_id": payment.provider_transaction_id,
        "mover_name_snapshot": mover.driver_full_name or "",
        "mover_phone_snapshot": mover.phone or None,
        "vehicle_type_snapshot": mover.vehicle_type or None,
        "number_plate_snapshot": mover.number_plate or None,
        "mover_profile_photo_snapshot": mover.profile_photo_url or None,
    }

    renter_document, _ = MovingFinancialDocument.objects.get_or_create(
        booking_id=booking.id,
        document_type="RENTER_RECEIPT",
        defaults={
            **common,
            "document_number": _document_number("SK-RCT"),
            "amount_kes": amount,
            "platform_fee_kes": Decimal("0.00"),
            "mover_net_kes": Decimal("0.00"),
            "status": "PAID",
            "issued_at": now,
            "paid_at": payment.paid_at or now,
        },
    )

    mover_document, _ = MovingFinancialDocument.objects.get_or_create(
        booking_id=booking.id,
        document_type="MOVER_SETTLEMENT",
        defaults={
            **common,
            "document_number": _document_number("SK-SET"),
            "amount_kes": amount,
            "platform_fee_kes": platform_fee,
            "mover_net_kes": mover_net,
            "status": "HELD",
            "issued_at": now,
            "released_at": None,
        },
    )

    # Existing documents are refreshed with authoritative payment data without
    # advancing the mover settlement beyond the escrow stage.
    update_values = {
        "payment_id": payment.id,
        "renter_id": booking.renter_id,
        "mover_id": booking.mover_id,
        "currency": "KES",
        "payment_provider": payment.provider,
        "provider_reference": payment.provider_reference,
        "provider_transaction_id": payment.provider_transaction_id,
        "amount_kes": amount,
        "platform_fee_kes": platform_fee,
        "mover_net_kes": mover_net,
        "status": "HELD",
        "released_at": None,
        "updated_at": timezone.now(),
    }
    MovingFinancialDocument.objects.filter(pk=mover_document.pk).update(**update_values)

    return {
        "renter_document_id": str(renter_document.id),
        "renter_document_number": renter_document.document_number,
        "mover_document_id": str(mover_document.id),
        "mover_document_number": mover_document.document_number,
        "payment_id": str(payment.id),
        "booking_id": str(booking.id),
        "status": "HELD",
    }


@transaction.atomic
def sync_moving_financial_documents_on_release(*, payment_id):
    """Finalize the mover settlement after provider-confirmed payout."""
    payment = MovingPayment.objects.select_for_update().filter(pk=payment_id).first()
    if payment is None:
        raise ValidationError("Moving payment not found")
    if payment.status != "RELEASED":
        raise ValidationError("Payment must be RELEASED before settlement synchronization")

    result = ensure_moving_financial_documents(payment_id=payment.id)
    now = timezone.now()
    MovingFinancialDocument.objects.filter(
        pk=result["mover_document_id"],
        document_type="MOVER_SETTLEMENT",
    ).update(
        status="RELEASED",
        released_at=payment.released_at or now,
        updated_at=now,
    )
    result["status"] = "RELEASED"
    return result
