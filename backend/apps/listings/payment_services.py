"""Server-side listing-payment settlement.

Provider payment confirms the entitlement for the already persisted draft.
It must never create a second Listing row when a draft is attached.
"""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import Any
from uuid import UUID

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.accounts.models import Profile
from apps.core.notification_services import dispatch_user_notification
from apps.payments.models import ListingPayment
from .models import Listing, ListingPaymentIntent
from .services import _create_listing_from_data, get_listing_entitlement

LISTING_PRICE_KES = Decimal("1000.00")
MONEY_QUANTUM = Decimal("0.01")
ALLOWED_LISTING_ROLES = {"landlord", "real_estate"}


def _money(value: Decimal | int | float | str) -> Decimal:
    return Decimal(str(value)).quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP)


@transaction.atomic
def process_listing_payment(
    payment_intent_id: UUID,
    *,
    provider: str,
    payment_method: str,
    provider_reference: str | None = None,
    checkout_request_id: str | None = None,
    merchant_request_id: str | None = None,
    mpesa_receipt: str | None = None,
    phone_number: str | None = None,
    result_code: int | None = None,
    result_description: str | None = None,
    provider_amount: Decimal | int | float | None = None,
    provider_currency: str | None = None,
    paypal_order_id: str | None = None,
    paypal_fx_rate: Decimal | None = None,
    paid_amount_kes: Decimal | int | float | None = None,
) -> dict[str, Any]:
    """Finalize an individual KES 1,000 payment exactly once."""
    provider = (provider or "").upper()
    payment_method = (payment_method or "").upper()
    if provider not in {"MPESA", "PAYPAL"} or payment_method not in {"MPESA", "PAYPAL"} or provider != payment_method:
        raise ValidationError("Unsupported individual listing payment provider")

    intent = ListingPaymentIntent.objects.select_for_update().filter(pk=payment_intent_id).first()
    if intent is None:
        raise ValidationError("Listing payment intent not found")
    if intent.status == "PAID":
        return {
            "success": True, "already_processed": True,
            "payment_intent_id": intent.id, "listing_id": intent.listing_id,
            "status": "PAID",
        }
    if intent.status != "PENDING":
        raise ValidationError("Payment intent is not pending")
    if intent.expires_at is not None and intent.expires_at <= timezone.now():
        intent.status = "EXPIRED"
        intent.updated_at = timezone.now()
        intent.save(update_fields=["status", "updated_at"])
        raise ValidationError("Payment intent has expired")

    intent_role = str(intent.role or "").strip().lower()
    if intent_role not in ALLOWED_LISTING_ROLES:
        raise ValidationError("Listing payment intent has an invalid role")

    provider_paid_amount = _money(provider_amount) if provider_amount is not None else None
    if provider_paid_amount is None or provider_paid_amount <= 0:
        raise ValidationError("A valid provider payment amount is required")

    if provider == "MPESA":
        if result_code is not None and int(result_code) != 0:
            raise ValidationError("M-Pesa payment was not successful")
        if provider_paid_amount != LISTING_PRICE_KES or _money(intent.amount_kes) != provider_paid_amount:
            raise ValidationError("Individual listing payment must be exactly KES 1,000")
        if not (mpesa_receipt or "").strip():
            raise ValidationError("A valid M-Pesa receipt is required")
        reference = (provider_reference or checkout_request_id or "").strip()
        if not reference:
            raise ValidationError("A valid M-Pesa provider reference is required")
        currency = "KES"
    else:
        reference = (provider_reference or "").strip()
        if not reference or (provider_currency or "").upper() != "USD":
            raise ValidationError("Valid PayPal capture reference, USD amount and currency are required")
        if not paypal_fx_rate or Decimal(str(paypal_fx_rate)) <= 0:
            raise ValidationError("A valid server exchange rate is required for PayPal settlement")
        fx_rate = Decimal(str(paypal_fx_rate))
        effective_paid_kes = _money(paid_amount_kes) if paid_amount_kes is not None else _money(intent.amount_kes)
        expected_kes = _money(intent.amount_kes)
        expected_usd = _money(expected_kes * fx_rate)
        if effective_paid_kes != expected_kes or provider_paid_amount != expected_usd:
            raise ValidationError("PayPal captured amount does not match the server-calculated payment amount")
        if intent.provider_amount is not None and _money(intent.provider_amount) != provider_paid_amount:
            raise ValidationError("PayPal amount does not match the payment intent")
        if intent.provider_currency and intent.provider_currency.upper() != "USD":
            raise ValidationError("PayPal payment intent currency is invalid")
        if intent.paypal_fx_rate is not None and Decimal(str(intent.paypal_fx_rate)) != fx_rate:
            raise ValidationError("PayPal FX rate does not match the payment intent")
        if intent.paypal_order_id and intent.paypal_order_id != paypal_order_id:
            raise ValidationError("PayPal order does not match payment intent")
        currency = "USD"

    profile = Profile.objects.select_for_update().filter(pk=intent.user_id).first()
    if profile is None:
        raise ValidationError("Profile not found")
    profile_role = str(getattr(profile, "role", "") or "").strip().lower()
    if profile_role != intent_role:
        raise ValidationError("The payment intent role no longer matches the account role")

    entitlement = get_listing_entitlement(profile)
    if not entitlement.get("authorized"):
        raise ValidationError("Account is not authorized to own listings")

    draft = None
    if intent.listing_id:
        draft = Listing.objects.select_for_update().filter(
            pk=intent.listing_id, user_id=profile.id, is_draft=True
        ).first()
        if not draft:
            raise ValidationError("The payment intent is not attached to an available draft")
        if bool(draft.is_property_management):
            raise ValidationError("Property-management listings require a PMS subscription")
        listing_id = draft.id
        draft.is_draft = False
        draft.is_paid = True
        draft.is_published = False
        draft.approval_status = "pending_review"
        draft.is_approved = False
        draft.status = "pending"
        draft.updated_at = timezone.now()
        draft.save(update_fields=[
            "is_draft", "is_paid", "is_published", "approval_status",
            "is_approved", "status", "updated_at"
        ])
        listing = {"listing_id": listing_id}
    else:
        # Backward-compatible path for old intents created before DB drafts.
        listing = _create_listing_from_data(
            profile, dict(intent.listing_data or {}),
            entitlement={**entitlement, "free_listings_remaining": 0},
            listing_entitlement="INDIVIDUAL_PAID", notify=False,
        )
        listing_id = listing["listing_id"]

    now = timezone.now()
    payment = ListingPayment.objects.create(
        user_id=profile.id,
        listing_id=listing_id,
        amount_kes=intent.amount_kes,
        status="PAID",
        payment_provider=provider,
        payment_method=payment_method,
        provider_reference=reference,
        checkout_request_id=checkout_request_id,
        merchant_request_id=merchant_request_id,
        mpesa_receipt=mpesa_receipt,
        phone_number=phone_number,
        provider_amount=provider_paid_amount,
        provider_currency=currency,
        paypal_order_id=paypal_order_id,
        paypal_fx_rate=paypal_fx_rate,
        result_code=result_code,
        result_description=result_description,
        paid_at=now,
    )

    intent.status = "PAID"
    intent.provider = provider
    intent.provider_reference = reference
    intent.provider_amount = provider_paid_amount
    intent.provider_currency = currency
    intent.paypal_order_id = paypal_order_id
    intent.paypal_fx_rate = paypal_fx_rate
    intent.listing_id = listing_id
    intent.paid_at = now
    intent.updated_at = now
    intent.save(update_fields=[
        "status", "provider", "provider_reference", "provider_amount",
        "provider_currency", "paypal_order_id", "paypal_fx_rate", "listing_id",
        "paid_at", "updated_at",
    ])

    listing_title = str((draft.title if draft else intent.listing_data or {}).get("title", "") if draft else dict(intent.listing_data or {}).get("title", ""))
    transaction.on_commit(lambda: dispatch_user_notification(
        user_id=profile.id, notification_type="LISTING_POSTED",
        title="Listing Posted Successfully - Saka Krib",
        message=f'Your property listing "{listing_title}" has been successfully created and is now awaiting administrator approval.',
        data={"listing_id": str(listing_id)}, event_key=f"listing:posted:{listing_id}",
        send_email=True, email_template="listing_posted",
    ))

    return {
        "success": True, "already_processed": False,
        "payment_intent_id": intent.id, "payment_id": payment.id,
        "listing_id": listing_id, "status": "PAID",
        "listing_is_paid": True, "listing_is_published": False,
        "listing_approval_status": "pending_review",
    }
