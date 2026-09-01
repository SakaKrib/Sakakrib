"""Authoritative SakaCrib rent workflow.

Rent is settled externally. Django records invoices, payment evidence and
landlord verification; it does not initiate rent collection.
"""

import calendar
import uuid
from datetime import date
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from apps.listings.models import Listing

from .domain_property import LandlordPaymentMethod, PropertyUnit, RenterUnitAssociation
from .domain_rent import RentInvoice, RentInvoicePeriod, RentPayment, RentPaymentSubmission
from .notification_services import dispatch_user_notification

ACTIVE_ASSOCIATION_STATUSES = {"ACTIVE"}
MAX_INVOICE_PERIODS = 24


def _clean_reference(value: str) -> str:
    reference = (value or "").strip()
    if len(reference) < 4:
        raise ValidationError("A valid transaction ID is required.")
    return reference


def _invoice_number(invoice_id=None) -> str:
    invoice_id = invoice_id or uuid.uuid4()
    return f"SC-RENT-{timezone.localdate():%Y%m%d}-{str(invoice_id).replace('-', '')[:10].upper()}"


def _invoice_payload(invoice):
    listing = Listing.objects.filter(id=invoice.listing_id).only("property_name", "title").first()
    periods = list(RentInvoicePeriod.objects.filter(invoice_id=invoice.id).order_by("period_year", "period_month"))
    return {
        "id": str(invoice.id), "invoice_number": invoice.invoice_number,
        "property_name": (listing.property_name or listing.title) if listing else None,
        "listing_id": str(invoice.listing_id), "unit_id": str(invoice.unit_id),
        "amount_kes": str(invoice.amount_kes), "currency": invoice.currency,
        "billing_period_start": invoice.billing_period_start.isoformat(),
        "billing_period_end": invoice.billing_period_end.isoformat(), "due_date": invoice.due_date.isoformat(),
        "status": invoice.status, "transaction_reference": invoice.transaction_reference,
        "payment_method": invoice.payment_method,
        "payment_date": invoice.payment_date.isoformat() if invoice.payment_date else None,
        "confirmed_by": str(invoice.confirmed_by) if invoice.confirmed_by else None,
        "confirmed_at": invoice.confirmed_at.isoformat() if invoice.confirmed_at else None,
        "periods": [{"period_year": p.period_year, "period_month": p.period_month, "amount_kes": str(p.amount_kes)} for p in periods],
    }


def _get_unit(unit_id, landlord_id=None):
    qs = PropertyUnit.objects.select_for_update().filter(id=unit_id)
    if landlord_id is not None:
        qs = qs.filter(user_id=landlord_id)
    try:
        return qs.get()
    except PropertyUnit.DoesNotExist as exc:
        raise ValidationError("Property unit not found or not owned by landlord.") from exc


def _get_payment_destination(payment_method_id, unit, actor_id):
    if not payment_method_id:
        raise ValidationError("Payment method is required.")
    if str(unit.user_id) != str(actor_id):
        authorized = RenterUnitAssociation.objects.filter(unit_id=unit.id, renter_user_id=actor_id, status__iexact="ACTIVE").exists()
        if not authorized:
            raise ValidationError("Not authorized to view this payment destination.")
    try:
        method = LandlordPaymentMethod.objects.get(id=payment_method_id, landlord_id=unit.user_id, is_active=True)
    except LandlordPaymentMethod.DoesNotExist as exc:
        raise ValidationError("Payment method is not authorized for this unit.") from exc
    return {
        "payment_method_id": str(method.id), "provider": method.provider, "mpesa_method": method.mpesa_method,
        "display_name": method.display_name, "paybill_number": method.paybill_number,
        "paybill_account": method.paybill_account, "till_number": method.till_number, "paypal_email": method.paypal_email,
    }


def _periods_from_payload(periods):
    if not isinstance(periods, list) or not periods:
        raise ValidationError("At least one billing period is required.")
    if len(periods) > MAX_INVOICE_PERIODS:
        raise ValidationError("An invoice may cover at most 24 monthly periods.")
    normalized, seen = [], set()
    for item in periods:
        try:
            year, month = int(item.get("period_year")), int(item.get("period_month"))
        except (AttributeError, TypeError, ValueError) as exc:
            raise ValidationError("Invalid billing period.") from exc
        if month < 1 or month > 12:
            raise ValidationError("Invalid billing period.")
        key = (year, month)
        if key in seen:
            raise ValidationError("Duplicate billing period.")
        seen.add(key); normalized.append(key)
    normalized.sort()
    for previous, current in zip(normalized, normalized[1:]):
        py, pm = previous
        expected = (py + 1, 1) if pm == 12 else (py, pm + 1)
        if current != expected:
            raise ValidationError("Billing periods must be consecutive.")
    return normalized


def _period_bounds(periods):
    start = date(periods[0][0], periods[0][1], 1)
    year, month = periods[-1]
    return start, date(year, month, calendar.monthrange(year, month)[1])


@transaction.atomic
def create_landlord_rent_invoice(*, landlord_id, unit_id=None, renter_assoc_id=None, periods=None, due_date=None,
                                  payment_method_id=None, billing_period_start=None, billing_period_end=None):
    if periods is None:
        if billing_period_start is None:
            raise ValidationError("At least one billing period is required.")
        periods = [{"period_year": billing_period_start.year, "period_month": billing_period_start.month}]
    normalized_periods = _periods_from_payload(periods)
    if due_date is None:
        raise ValidationError("Due date is required.")

    if renter_assoc_id:
        try:
            association = RenterUnitAssociation.objects.select_for_update().get(id=renter_assoc_id, landlord_id=landlord_id, status__iexact="ACTIVE")
        except RenterUnitAssociation.DoesNotExist as exc:
            raise ValidationError("No active renter is associated with this unit.") from exc
        unit_id = association.unit_id
    elif not unit_id:
        raise ValidationError("Unit is required.")
    else:
        association = None

    unit = _get_unit(unit_id, landlord_id=landlord_id)
    if not unit.payment_tracking_enabled:
        raise ValidationError("Payment tracking is disabled for this unit.")
    if unit.rent is None or Decimal(unit.rent) <= 0:
        raise ValidationError("Unit rent is not configured.")
    if association is None:
        association = RenterUnitAssociation.objects.select_for_update().filter(unit_id=unit.id, landlord_id=landlord_id, status__iexact="ACTIVE").order_by("-created_at").first()
        if association is None:
            raise ValidationError("No active renter is associated with this unit.")

    payment_destination = _get_payment_destination(payment_method_id, unit, landlord_id)
    period_start, period_end = _period_bounds(normalized_periods)
    if due_date < period_start:
        raise ValidationError("Due date cannot be before the billing period starts.")

    active_invoice_ids = RentInvoice.objects.filter(status__in=["DUE", "PAYMENT_SUBMITTED"]).values_list("id", flat=True)
    for year, month in normalized_periods:
        if RentPayment.objects.filter(renter_assoc_id=association.id, period_year=year, period_month=month, status__iexact="PAID").exists():
            raise ValidationError(f"Billing period {year}-{month:02d} is already paid.")
        if RentInvoicePeriod.objects.filter(renter_assoc_id=association.id, period_year=year, period_month=month, invoice_id__in=active_invoice_ids).exists():
            raise ValidationError(f"Billing period {year}-{month:02d} already has an active invoice.")

    invoice_id = uuid.uuid4()
    total = Decimal(unit.rent) * len(normalized_periods)
    invoice = RentInvoice.objects.create(
        id=invoice_id, invoice_number=_invoice_number(invoice_id), landlord_id=landlord_id,
        renter_user_id=association.renter_user_id, renter_assoc_id=association.id, listing_id=unit.listing_id,
        unit_id=unit.id, billing_period_start=period_start, billing_period_end=period_end, due_date=due_date,
        amount_kes=total, currency="KES", status="DUE", payment_method_id=payment_method_id,
        payment_destination_snapshot=payment_destination,
    )
    RentInvoicePeriod.objects.bulk_create([
        RentInvoicePeriod(invoice_id=invoice.id, renter_assoc_id=association.id, unit_id=unit.id,
                          period_year=year, period_month=month, amount_kes=Decimal(unit.rent))
        for year, month in normalized_periods
    ])
    dispatch_user_notification(
        user_id=association.renter_user_id, notification_type="RENT_INVOICE_CREATED",
        title="New rent invoice", message="A new rent invoice has been created for your unit.",
        data={"invoice_id": str(invoice.id), "invoice_number": invoice.invoice_number, "amount_kes": str(total), "due_date": due_date.isoformat()},
        event_key=f"rent-invoice:{invoice.id}",
    )
    return _invoice_payload(invoice)


@transaction.atomic
def submit_invoice_payment(*, renter_user_id, invoice_id, transaction_reference, payment_method=None, payment_date=None):
    reference = _clean_reference(transaction_reference)
    invoice = RentInvoice.objects.select_for_update().filter(id=invoice_id, renter_user_id=renter_user_id).first()
    if invoice is None:
        raise ValidationError("Invoice not found or not accessible.")
    if invoice.status not in {"DUE", "REJECTED"}:
        raise ValidationError(f"Invoice cannot accept a payment submission in status {invoice.status}.")
    if RentPaymentSubmission.objects.filter(transaction_reference__iexact=reference).exists():
        raise ValidationError("This transaction ID has already been submitted.")
    if RentPaymentSubmission.objects.filter(invoice_id=invoice.id, status="PENDING").exists():
        raise ValidationError("This invoice already has a payment awaiting landlord confirmation.")
    submission = RentPaymentSubmission.objects.create(
        invoice_id=invoice.id, renter_user_id=renter_user_id, landlord_id=invoice.landlord_id,
        renter_assoc_id=invoice.renter_assoc_id, unit_id=invoice.unit_id, transaction_reference=reference,
        payment_method=(payment_method or "").strip() or None, payment_date=payment_date, status="PENDING",
    )
    invoice.status = "PAYMENT_SUBMITTED"
    invoice.transaction_reference = reference
    invoice.payment_method = submission.payment_method
    invoice.payment_date = payment_date
    invoice.save(update_fields=["status", "transaction_reference", "payment_method", "payment_date", "updated_at"])
    dispatch_user_notification(
        user_id=invoice.landlord_id, notification_type="RENT_PAYMENT_CONFIRMATION_REQUIRED",
        title="Rent payment awaiting confirmation",
        message="A renter has submitted a transaction ID for rent. Verify the payment externally and confirm or reject it.",
        data={"invoice_id": str(invoice.id), "submission_id": str(submission.id), "transaction_reference": reference, "amount_kes": str(invoice.amount_kes)},
        event_key=f"rent-submission:{submission.id}",
    )
    return {"success": True, "submission_id": str(submission.id), "invoice_id": str(invoice.id), "status": "PENDING"}


@transaction.atomic
def confirm_rent_payment(*, landlord_id, submission_id):
    submission = RentPaymentSubmission.objects.select_for_update().filter(id=submission_id, landlord_id=landlord_id).first()
    if submission is None:
        raise ValidationError("Payment submission not found or not authorized.")
    if submission.status == "CONFIRMED":
        return {"success": True, "idempotent": True, "submission_id": str(submission.id), "status": "CONFIRMED"}
    if submission.status != "PENDING":
        raise ValidationError("Payment submission is not pending.")
    invoice = RentInvoice.objects.select_for_update().get(id=submission.invoice_id)
    if invoice.landlord_id != landlord_id:
        raise ValidationError("Not authorized to confirm this invoice.")
    if invoice.status != "PAYMENT_SUBMITTED":
        raise ValidationError("Invoice is not awaiting payment confirmation.")

    payment_ids = []
    for period in RentInvoicePeriod.objects.filter(invoice_id=invoice.id).order_by("period_year", "period_month"):
        if RentPayment.objects.filter(renter_assoc_id=invoice.renter_assoc_id, period_year=period.period_year, period_month=period.period_month, status__iexact="PAID").exists():
            raise ValidationError(f"Billing period {period.period_year}-{period.period_month:02d} is already paid.")
        payment = RentPayment.objects.create(
            renter_assoc_id=invoice.renter_assoc_id, unit_id=invoice.unit_id, landlord_id=invoice.landlord_id,
            amount_kes=period.amount_kes, period_year=period.period_year, period_month=period.period_month,
            status="PAID", paid_at=timezone.now(), payment_provider="MANUAL",
            payment_method=invoice.payment_method or "MANUAL", provider_reference=submission.transaction_reference,
            payment_method_id=invoice.payment_method_id, payment_destination_snapshot=invoice.payment_destination_snapshot,
        )
        payment_ids.append(str(payment.id))

    now = timezone.now()
    submission.status = "CONFIRMED"; submission.confirmed_by = landlord_id; submission.confirmed_at = now
    submission.save(update_fields=["status", "confirmed_by", "confirmed_at", "updated_at"])
    invoice.status = "PAID"; invoice.paid_at = now; invoice.confirmed_by = landlord_id; invoice.confirmed_at = now
    invoice.save(update_fields=["status", "paid_at", "confirmed_by", "confirmed_at", "updated_at"])
    data = {"invoice_id": str(invoice.id), "invoice_number": invoice.invoice_number, "submission_id": str(submission.id), "transaction_reference": submission.transaction_reference, "amount_kes": str(invoice.amount_kes), "payment_ids": payment_ids}
    dispatch_user_notification(user_id=invoice.renter_user_id, notification_type="RENT_PAYMENT_CONFIRMED", title="Rent payment confirmed", message="Your landlord has confirmed your rent payment. Your SakaCrib invoice is now marked PAID.", data=data, event_key=f"rent-confirmed:renter:{invoice.id}")
    dispatch_user_notification(user_id=landlord_id, notification_type="RENT_PAYMENT_CONFIRMED", title="Rent payment confirmed", message="The submitted rent payment has been confirmed and recorded as PAID.", data=data, event_key=f"rent-confirmed:landlord:{invoice.id}")
    return {"success": True, "idempotent": False, "submission_id": str(submission.id), "invoice_id": str(invoice.id), "invoice_number": invoice.invoice_number, "status": "PAID", "payment_ids": payment_ids}


@transaction.atomic
def reject_rent_payment(*, landlord_id, submission_id, rejection_reason):
    reason = (rejection_reason or "").strip()
    if not reason:
        raise ValidationError("A rejection reason is required.")
    submission = RentPaymentSubmission.objects.select_for_update().filter(id=submission_id, landlord_id=landlord_id).first()
    if submission is None:
        raise ValidationError("Payment submission not found or not authorized.")
    if submission.status != "PENDING":
        raise ValidationError("Payment submission is not pending.")
    invoice = RentInvoice.objects.select_for_update().get(id=submission.invoice_id)
    if invoice.landlord_id != landlord_id:
        raise ValidationError("Invoice not found or not authorized.")
    submission.status = "REJECTED"; submission.rejection_reason = reason
    submission.save(update_fields=["status", "rejection_reason", "updated_at"])
    invoice.status = "REJECTED"; invoice.save(update_fields=["status", "updated_at"])
    dispatch_user_notification(
        user_id=invoice.renter_user_id, notification_type="RENT_PAYMENT_REJECTED",
        title="Rent payment needs attention",
        message="Your landlord could not confirm the submitted rent transaction. Please review the invoice and submit the correct transaction ID.",
        data={"invoice_id": str(invoice.id), "invoice_number": invoice.invoice_number, "submission_id": str(submission.id), "reason": reason},
        event_key=f"rent-rejected:{submission.id}",
    )
    return {"success": True, "submission_id": str(submission.id), "invoice_id": str(invoice.id), "status": "REJECTED"}
