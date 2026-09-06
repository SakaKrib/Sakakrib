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
    """Create the two auditable financial documents for a successful payment.

    This is deliberately additive: the existing MovingInvoice/MovingPayment
    contract remains unchanged. The new documents are idempotent through the
    database uniqueness constraint on (booking_id, document_type).
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
            "issued_at": timezone.now(),
            "paid_at": payment.paid_at or timezone.now(),
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
            "status": "RELEASED" if payment.status == "RELEASED" else "HELD",
            "issued_at": timezone.now(),
            "released_at": payment.released_at if payment.status == "RELEASED" else None,
        },
    )

    return {
        "renter_document_id": str(renter_document.id),
        "renter_document_number": renter_document.document_number,
        "mover_document_id": str(mover_document.id),
        "mover_document_number": mover_document.document_number,
        "payment_id": str(payment.id),
        "booking_id": str(booking.id),
        "status": mover_document.status,
    }
