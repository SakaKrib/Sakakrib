"""Server-side listing-payment settlement.

This is the Django equivalent of production ``process_listing_payment``.
Keep this service behind authenticated/server-only API boundaries; provider
callbacks must be verified before calling it.
"""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import Any
from uuid import UUID

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.accounts.models import Profile
from apps.payments.models import ListingPayment
from .models import ListingPaymentIntent
from .services import _create_listing_from_data, get_listing_entitlement

LISTING_PRICE_KES = Decimal("1000.00")
MONEY_QUANTUM = Decimal("0.01")


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
    """Finalize an individual KES 1,000 listing payment exactly once."""
    provider = (provider or "").upper()
    payment_method = (payment_method or "").upper()
    if provider not in {"MPESA", "PAYPAL"} or payment_method not in {"MPESA", "PAYPAL"} or provider != payment_method:
        raise ValidationError("Unsupported individual listing payment provider")

    intent = ListingPaymentIntent.objects.select_for_update().filter(pk=payment_intent_id).first()
    if intent is None:
        raise ValidationError("Listing payment intent not found")
    if intent.status == "PAID":
        return {
            "success": True,
            "already_processed": True,
            "payment_intent_id": intent.id,
            "listing_id": intent.listing_id,
            "status": "PAID",
        }
    if intent.status != "PENDING":
        raise ValidationError("Payment intent is not pending")
    if intent.expires_at is not None and intent.expires_at <= timezone.now():
        intent.status = "EXPIRED"
        intent.updated_at = timezone.now()
        intent.save(update_fields=["status", "updated_at"])
        raise ValidationError("Payment intent has expired")

    provider_paid_amount = _money(provider_amount) if provider_amount is not None else None
    if provider_paid_amount is None or provider_paid_amount <= 0:
        raise ValidationError("A valid provider payment amount is required")

    if provider == "MPESA":
        if result_code is not None and int(result_code) != 0:
            raise ValidationError("M-Pesa payment was not successful")
        if provider_paid_amount != LISTING_PRICE_KES:
            raise ValidationError("Individual listing payment must be exactly KES 1,000")
        if _money(intent.amount_kes) != provider_paid_amount:
            raise ValidationError("Payment amount does not match payment intent")
        if not (mpesa_receipt or "").strip():
            raise ValidationError("Valid M-Pesa receipt and provider reference are required")
        reference = (provider_reference or checkout_request_id or "").strip()
        if not reference:
            raise ValidationError("Valid M-Pesa receipt and provider reference are required")
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
        if effective_paid_kes != expected_kes:
            raise ValidationError("Paid KES amount does not match payment intent")

        # Reconcile against the exact USD amount the server authorized when
        # creating this intent. Do not reverse-convert a rounded provider amount
        # because that can introduce a false match or false rejection.
        expected_usd = _money(expected_kes * fx_rate)
        if provider_paid_amount != expected_usd:
            raise ValidationError("PayPal captured amount does not match the server-calculated USD payment amount")
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
    entitlement = get_listing_entitlement(profile)
    if not entitlement.get("can_start_listing"):
        raise ValidationError("Account is no longer eligible to create a listing")
    if entitlement.get("can_create"):
        raise ValidationError("An existing free or subscription entitlement is available; individual payment is not required")

    listing = _create_listing_from_data(
        profile,
        dict(intent.listing_data or {}),
        entitlement={**entitlement, "free_listings_remaining": 0},
        listing_entitlement="INDIVIDUAL_PAID",
    )
    now = timezone.now()
    payment = ListingPayment.objects.create(
        user_id=profile.id,
        listing_id=listing["listing_id"],
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
    intent.listing_id = listing["listing_id"]
    intent.paid_at = now
    intent.updated_at = now
    intent.save(update_fields=[
        "status", "provider", "provider_reference", "provider_amount",
        "provider_currency", "paypal_order_id", "paypal_fx_rate", "listing_id",
        "paid_at", "updated_at",
    ])

    return {
        "success": True,
        "already_processed": False,
        "payment_intent_id": intent.id,
        "payment_id": payment.id,
        "listing_id": listing["listing_id"],
        "status": "PAID",
        "listing_is_paid": True,
        "listing_is_published": False,
        "listing_approval_status": "pending_review",
    }
