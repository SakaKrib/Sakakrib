"""Authoritative SakaCrib rent workflow.

Rent money is settled outside SakaCrib. Django records invoices and external
transaction references, then the landlord confirms or rejects the submission.
Legacy provider-payment models are intentionally not used here.
"""

import uuid
from datetime import date
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from apps.listings.models import Listing

from .domain_property import PropertyUnit, RenterUnitAssociation
from .domain_rent import RentInvoice, RentPaymentSubmission


ACTIVE_ASSOCIATION_STATUSES = {"ACTIVE"}


def _clean_reference(transaction_reference: str) -> str:
    value = (transaction_reference or "").strip()
    if len(value) < 3:
        raise ValidationError("Transaction ID/reference must contain at least 3 characters.")
    return value


def _get_active_association(*, unit_id, renter_user_id=None, landlord_id=None):
    qs = RenterUnitAssociation.objects.select_for_update().filter(
        id=unit_id if False else None
    )
    # Associations are keyed by their own id; callers filter explicitly below.
    qs = RenterUnitAssociation.objects.select_for_update().filter(
        unit_id=unit_id,
        status__in=ACTIVE_ASSOCIATION_STATUSES,
    )
    if renter_user_id is not None:
        qs = qs.filter(renter_user_id=renter_user_id)
    if landlord_id is not None:
        qs = qs.filter(landlord_id=landlord_id)
    association = qs.first()
    if association is None:
        raise ValidationError("No active renter/unit association was found.")
    return association


def _get_unit(unit_id):
    try:
        return PropertyUnit.objects.select_for_update().get(id=unit_id)
    except PropertyUnit.DoesNotExist as exc:
        raise ValidationError("The selected unit does not exist.") from exc


def _get_listing(unit):
    try:
        return Listing.objects.get(id=unit.listing_id)
    except Listing.DoesNotExist as exc:
        raise ValidationError("The unit is not attached to a valid property listing.") from exc


def _invoice_number() -> str:
    return f"INV-{timezone.now():%Y%m%d}-{uuid.uuid4().hex[:10].upper()}"


def _invoice_payload(invoice):
    listing = Listing.objects.filter(id=invoice.listing_id).only("property_name", "title").first()
    return {
        "id": str(invoice.id),
        "invoice_number": invoice.invoice_number,
        "property_name": (listing.property_name or listing.title) if listing else None,
        "listing_id": str(invoice.listing_id),
        "unit_id": str(invoice.unit_id),
        "amount_kes": str(invoice.amount_kes),
        "currency": invoice.currency,
        "billing_period_start": invoice.billing_period_start.isoformat(),
        "billing_period_end": invoice.billing_period_end.isoformat(),
        "due_date": invoice.due_date.isoformat(),
        "status": invoice.status,
        "transaction_reference": invoice.transaction_reference,
        "payment_method": invoice.payment_method,
        "payment_date": invoice.payment_date.isoformat() if invoice.payment_date else None,
        "confirmed_by": str(invoice.confirmed_by) if invoice.confirmed_by else None,
        "confirmed_at": invoice.confirmed_at.isoformat() if invoice.confirmed_at else None,
    }


@transaction.atomic
def create_landlord_rent_invoice(
    *,
    landlord_id,
    renter_assoc_id,
    billing_period_start: date,
    billing_period_end: date,
    due_date: date,
):
    """Create an invoice for a landlord's active renter/unit association.

    The amount is always derived from the unit's configured rent; callers cannot
    supply or override the invoice amount.
    """
    try:
        association = RenterUnitAssociation.objects.select_for_update().get(
            id=renter_assoc_id,
            landlord_id=landlord_id,
            status__in=ACTIVE_ASSOCIATION_STATUSES,
        )
    except RenterUnitAssociation.DoesNotExist as exc:
        raise ValidationError("The renter/unit association is not active or does not belong to this landlord.") from exc

    unit = _get_unit(association.unit_id)
    if unit.rent is None or Decimal(unit.rent) < 0:
        raise ValidationError("The selected unit has no valid rent amount.")

    if billing_period_end < billing_period_start:
        raise ValidationError("Billing period end cannot precede its start.")
    if due_date < billing_period_start:
        raise ValidationError("Due date cannot precede the billing period start.")

    invoice = RentInvoice.objects.create(
        invoice_number=_invoice_number(),
        landlord_id=landlord_id,
        renter_user_id=association.renter_user_id,
        renter_assoc_id=association.id,
        listing_id=unit.listing_id,
        unit_id=unit.id,
        billing_period_start=billing_period_start,
        billing_period_end=billing_period_end,
        due_date=due_date,
        amount_kes=Decimal(unit.rent),
        currency="KES",
        status="DUE",
    )
    return _invoice_payload(invoice)


@transaction.atomic
def submit_invoice_payment(*, renter_user_id, invoice_id, transaction_reference, payment_method=None, payment_date=None):
    """Submit an external payment reference against a landlord-created invoice."""
    reference = _clean_reference(transaction_reference)

    try:
        invoice = RentInvoice.objects.select_for_update().get(
            id=invoice_id,
            renter_user_id=renter_user_id,
        )
    except RentInvoice.DoesNotExist as exc:
        raise ValidationError("Invoice not found for this renter.") from exc

    if invoice.status == "PAID":
        raise ValidationError("This invoice has already been confirmed as paid.")
    if invoice.status in {"CANCELLED", "REJECTED"}:
        raise ValidationError("This invoice cannot accept a payment submission in its current state.")

    if RentPaymentSubmission.objects.filter(invoice_id=invoice.id, status="PENDING").exists():
        raise ValidationError("This invoice already has a pending payment submission.")

    submission = RentPaymentSubmission.objects.create(
        invoice_id=invoice.id,
        renter_user_id=invoice.renter_user_id,
        landlord_id=invoice.landlord_id,
        renter_assoc_id=invoice.renter_assoc_id,
        unit_id=invoice.unit_id,
        transaction_reference=reference,
        payment_method=(payment_method or "").strip() or None,
        payment_date=payment_date,
        status="PENDING",
    )
    return {"submission_id": str(submission.id), "invoice": _invoice_payload(invoice)}


@transaction.atomic
def create_renter_paid_invoice(
    *,
    renter_user_id,
    unit_id,
    payment_date: date,
    payment_method: str,
    transaction_reference: str,
):
    """Create a renter-originated payment invoice/notification.

    This creates the invoice and its pending external-payment submission in one
    transaction. The rent amount is read from the selected unit.
    """
    method = (payment_method or "").strip()
    if not method:
        raise ValidationError("Payment method is required when the renter creates the payment invoice.")
    reference = _clean_reference(transaction_reference)
    if payment_date is None:
        raise ValidationError("Payment date is required.")

    unit = _get_unit(unit_id)
    association = _get_active_association(unit_id=unit.id, renter_user_id=renter_user_id)
    _get_listing(unit)

    if unit.rent is None or Decimal(unit.rent) < 0:
        raise ValidationError("The selected unit has no valid rent amount.")

    # A renter-originated invoice represents the rental period containing the
    # externally supplied payment date. No provider checkout or money transfer
    # is initiated by SakaCrib.
    period_start = payment_date.replace(day=1)
    if payment_date.month == 12:
        next_month = date(payment_date.year + 1, 1, 1)
    else:
        next_month = date(payment_date.year, payment_date.month + 1, 1)
    period_end = next_month.fromordinal(next_month.toordinal() - 1)

    invoice = RentInvoice.objects.create(
        invoice_number=_invoice_number(),
        landlord_id=association.landlord_id,
        renter_user_id=renter_user_id,
        renter_assoc_id=association.id,
        listing_id=unit.listing_id,
        unit_id=unit.id,
        billing_period_start=period_start,
        billing_period_end=period_end,
        due_date=payment_date,
        amount_kes=Decimal(unit.rent),
        currency="KES",
        status="DUE",
    )

    submission = RentPaymentSubmission.objects.create(
        invoice_id=invoice.id,
        renter_user_id=renter_user_id,
        landlord_id=association.landlord_id,
        renter_assoc_id=association.id,
        unit_id=unit.id,
        transaction_reference=reference,
        payment_method=method,
        payment_date=payment_date,
        status="PENDING",
    )
    return {"submission_id": str(submission.id), "invoice": _invoice_payload(invoice)}


@transaction.atomic
def confirm_rent_payment(*, landlord_id, submission_id):
    """Landlord confirms an externally settled rent payment."""
    try:
        submission = RentPaymentSubmission.objects.select_for_update().get(
            id=submission_id,
            landlord_id=landlord_id,
        )
    except RentPaymentSubmission.DoesNotExist as exc:
        raise ValidationError("Payment submission not found for this landlord.") from exc

    if submission.status != "PENDING":
        raise ValidationError("Only pending payment submissions can be confirmed.")

    invoice = RentInvoice.objects.select_for_update().get(id=submission.invoice_id)
    if invoice.landlord_id != landlord_id:
        raise ValidationError("You are not authorized to confirm this invoice.")
    if invoice.status == "PAID":
        raise ValidationError("This invoice has already been confirmed.")

    now = timezone.now()
    submission.status = "CONFIRMED"
    submission.confirmed_by = landlord_id
    submission.confirmed_at = now
    submission.save(update_fields=["status", "confirmed_by", "confirmed_at", "updated_at"])

    invoice.status = "PAID"
    invoice.transaction_reference = submission.transaction_reference
    invoice.payment_method = submission.payment_method
    invoice.payment_date = submission.payment_date
    invoice.paid_at = now
    invoice.confirmed_by = landlord_id
    invoice.confirmed_at = now
    invoice.save(
        update_fields=[
            "status",
            "transaction_reference",
            "payment_method",
            "payment_date",
            "paid_at",
            "confirmed_by",
            "confirmed_at",
            "updated_at",
        ]
    )
    return _invoice_payload(invoice)


@transaction.atomic
def reject_rent_payment(*, landlord_id, submission_id, rejection_reason):
    """Landlord rejects an externally supplied rent-payment reference."""
    reason = (rejection_reason or "").strip()
    if len(reason) < 3:
        raise ValidationError("A rejection reason must contain at least 3 characters.")

    try:
        submission = RentPaymentSubmission.objects.select_for_update().get(
            id=submission_id,
            landlord_id=landlord_id,
        )
    except RentPaymentSubmission.DoesNotExist as exc:
        raise ValidationError("Payment submission not found for this landlord.") from exc

    if submission.status != "PENDING":
        raise ValidationError("Only pending payment submissions can be rejected.")

    invoice = RentInvoice.objects.select_for_update().get(id=submission.invoice_id)
    if invoice.landlord_id != landlord_id:
        raise ValidationError("You are not authorized to reject this invoice payment.")
    if invoice.status == "PAID":
        raise ValidationError("A paid invoice cannot be rejected.")

    submission.status = "REJECTED"
    submission.confirmed_by = landlord_id
    submission.confirmed_at = timezone.now()
    submission.rejection_reason = reason
    submission.save(
        update_fields=[
            "status",
            "confirmed_by",
            "confirmed_at",
            "rejection_reason",
            "updated_at",
        ]
    )
    return _invoice_payload(invoice)
