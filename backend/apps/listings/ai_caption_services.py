import json
import urllib.error
import urllib.parse
import urllib.request

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.accounts.authorization import is_admin
from apps.core.domain_property import PropertyUnit, RenterUnitAssociation

from .models import Listing


def _money(value):
    if value is None:
        return None
    try:
        amount = float(value)
    except (TypeError, ValueError):
        return None
    return f"{amount:,.0f}" if amount > 0 else None


def _location(listing):
    parts = [str(value).strip() for value in (listing.city, listing.county) if str(value or "").strip()]
    return ", ".join(parts) or str(listing.location_search or "Kenya").strip()


def _property_name(listing):
    return str(listing.property_name or listing.title or "Property").strip()


def _unit_rows(listing):
    if not listing.is_property_management:
        return []

    units = list(
        PropertyUnit.objects.filter(listing_id=listing.id).order_by("position", "created_at")
    )
    if not units:
        return []

    active_unit_ids = set(
        RenterUnitAssociation.objects.filter(
            unit_id__in=[unit.id for unit in units],
            status__iexact="ACTIVE",
        ).values_list("unit_id", flat=True)
    )
    rows = []
    for unit in units:
        availability = str(unit.availability or "available").strip().lower()
        occupied = unit.id in active_unit_ids or availability in {
            "occupied", "unavailable", "rented", "leased"
        }
        rows.append({
            "unit": unit,
            "listing_type": str(unit.listing_type or "rent").strip().lower(),
            "status": "occupied" if occupied else "available",
        })
    return rows


def _unit_price_text(unit, listing_type):
    if listing_type == "sale":
        sale_price = _money(unit.sale_price)
        installment_total = _money(unit.installment_total_price)
        installment_amount = _money(unit.installment_amount)
        frequency_value = str(unit.installment_frequency or "monthly").strip().lower()
        frequency = {
            "daily": "day",
            "weekly": "week",
            "biweekly": "two weeks",
            "fortnightly": "two weeks",
            "monthly": "month",
            "quarterly": "quarter",
            "yearly": "year",
            "annually": "year",
            "annual": "year",
        }.get(frequency_value, frequency_value.rstrip("ly"))
        periods = unit.installment_periods
        pieces = []
        if sale_price:
            pieces.append(f"Asking price KES {sale_price}")
        if installment_total:
            pieces.append(f"installment total KES {installment_total}")
        if installment_amount:
            pieces.append(
                f"installments KES {installment_amount}/{frequency}"
                + (f" for {periods} payments" if periods else "")
            )
        if _money(unit.installment_deposit):
            pieces.append(f"initial deposit KES {_money(unit.installment_deposit)}")
        return "; ".join(pieces) or "Price on request"

    rent = _money(unit.rent)
    if not rent:
        return "Rent on request"
    deposit = _money(unit.deposit_amount)
    return f"KES {rent}/month" + (f"; deposit KES {deposit}" if deposit else "")


def _unit_context(rows):
    if not rows:
        return ""
    lines = []
    for row in rows:
        unit = row["unit"]
        kind = row["listing_type"]
        unit_type = str(unit.unit_type or "unit").replace("_", " ")
        facts = [
            f"Unit {unit.unit_number} ({unit_type})",
            f"offer: {'FOR SALE' if kind == 'sale' else 'FOR RENT'}",
            f"price: {_unit_price_text(unit, kind)}",
            f"availability: {row['status']}",
            f"size: {unit.size or 'Not provided'}",
            f"bedrooms: {unit.beds if unit.beds is not None else 'Not provided'}",
            f"bathrooms: {unit.baths if unit.baths is not None else 'Not provided'}",
        ]
        if str(unit.description or "").strip():
            facts.append(f"description: {str(unit.description).strip()}")
        lines.append("- " + " | ".join(facts))
    return "\n".join(lines)


def _single_listing_facts(listing):
    kind = str(listing.listing_type or "rent").lower()
    if kind == "sale":
        price = _money(listing.price_kes)
        price_line = f"Asking price: KES {price}" if price else "Asking price: Contact for price"
    else:
        price = _money(listing.price_kes)
        price_line = f"Monthly rent: KES {price}" if price else "Monthly rent: Contact for price"

    facts = [
        f"🏠 {'FOR SALE' if kind == 'sale' else 'FOR RENT'}",
        _property_name(listing),
        f"📍 Location: {_location(listing)}",
        f"💰 {price_line}",
        f"📐 Size: {listing.size or 'Not specified'}",
        f"🛏️ Bedrooms: {listing.beds if listing.beds is not None else 'Not specified'}",
        f"🛁 Bathrooms: {listing.baths if listing.baths is not None else 'Not specified'}",
    ]
    if kind == "rent":
        deposit = _money(listing.deposit_amount) if listing.deposit_required else None
        facts.append(
            f"🔐 Deposit: KES {deposit}" if deposit else
            ("🔐 Deposit: Required; amount not provided" if listing.deposit_required else "🔐 No deposit required")
        )
    return "\n".join(facts)


def _multi_unit_facts(listing, rows):
    kinds = {row["listing_type"] for row in rows}
    if kinds == {"rent"}:
        heading = "🏢 MULTI-UNIT PROPERTY — FOR RENT"
    elif kinds == {"sale"}:
        heading = "🏢 MULTI-UNIT PROPERTY — FOR SALE"
    else:
        heading = "🏢 MULTI-UNIT PROPERTY — RENT & SALE OPTIONS"

    lines = [
        heading,
        _property_name(listing),
        f"📍 Location: {_location(listing)}",
        f"🏘️ {len(rows)} individual units",
    ]
    for row in rows:
        unit = row["unit"]
        kind = row["listing_type"]
        unit_type = str(unit.unit_type or "unit").replace("_", " ")
        lines.extend([
            "",
            f"{'FOR SALE' if kind == 'sale' else 'FOR RENT'} — Unit {unit.unit_number} ({unit_type})",
            f"💰 {_unit_price_text(unit, kind)}",
            f"📐 Size: {unit.size or 'Not specified'}",
            f"🛏️ {unit.beds if unit.beds is not None else '—'} bed · 🛁 {unit.baths if unit.baths is not None else '—'} bath",
            f"Availability: {row['status'].title()}",
        ])
    return "\n".join(lines)


def _fallback_narrative(listing, rows):
    if rows:
        descriptions = [
            str(row["unit"].description).strip()
            for row in rows
            if str(row["unit"].description or "").strip()
        ]
        if descriptions:
            return "Explore the individual unit options below. Each unit has its own pricing, size, and availability details."
        return f"{_property_name(listing)} offers a range of individual units. Review the unit details and availability below."
    return str(listing.description or "").strip() or (
        f"Discover { _property_name(listing) } in {_location(listing)}. "
        "Contact the property team for further information."
    )


def _gemini_narrative(listing, rows):
    api_key = str(getattr(settings, "GEMINI_API_KEY", "") or "").strip()
    if not api_key:
        return None

    if rows:
        prompt = (
            "You are an experienced Kenyan real-estate marketing copywriter. Write a polished, "
            "trustworthy community-feed description for a multi-unit property. This is a dedicated "
            "unit-focused generation: distinguish the units using their supplied unit number, type, "
            "description, size and room counts. Mention rental and sale options separately if both "
            "exist. Do not invent amenities, finishes, views, nearby facilities, transport links, "
            "prices, room counts, availability or other facts. Do not change or calculate prices. "
            "The application will display the authoritative unit prices and availability separately, "
            "so focus on a natural, appealing overview. If a detail is absent, omit it. Use tasteful "
            "emojis sparingly. Return only 2–3 concise paragraphs, under 130 words.\n\n"
            f"Property: {_property_name(listing)}\n"
            f"Location: {_location(listing)}\n"
            f"Property description: {listing.description or 'Not provided'}\n"
            f"Unit inventory:\n{_unit_context(rows)}"
        )
        max_tokens = 260
    else:
        kind = str(listing.listing_type or "rent").lower()
        prompt = (
            "You are an experienced Kenyan real-estate marketing copywriter. Write a polished, "
            "trustworthy community-feed description for this single property listing. The listing "
            f"is {'FOR SALE' if kind == 'sale' else 'FOR RENT'}. Do not switch the transaction type. "
            "Do not invent amenities, finishes, views, nearby facilities, transport links, prices, "
            "room counts or other facts. The application displays the authoritative listing facts "
            "separately, so focus on a natural, appealing description based only on the supplied "
            "description. If details are absent, omit them. Use tasteful emojis sparingly. Return "
            "only 2 concise paragraphs, under 100 words.\n\n"
            f"Property: {_property_name(listing)}\n"
            f"Location: {_location(listing)}\n"
            f"Transaction: {'FOR SALE' if kind == 'sale' else 'FOR RENT'}\n"
            f"Property description: {listing.description or 'Not provided'}"
        )
        max_tokens = 200

    payload = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.45, "maxOutputTokens": max_tokens},
    }).encode("utf-8")
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"gemini-1.5-flash:generateContent?key={urllib.parse.quote(api_key)}"
    )
    request = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            if response.status < 200 or response.status >= 300:
                return None
            data = json.loads(response.read().decode("utf-8"))
        narrative = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
        return str(narrative).strip() or None
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError, KeyError, IndexError):
        return None


def _fallback_caption(listing, rows=None):
    rows = rows if rows is not None else _unit_rows(listing)
    facts = _multi_unit_facts(listing, rows) if rows else _single_listing_facts(listing)
    narrative = _fallback_narrative(listing, rows)
    city_tag = "".join(char for char in str(listing.city or "Kenya").title() if char.isalnum()) or "Kenya"
    if rows:
        property_tag = "PropertyUnits"
    else:
        property_tag = "PropertyForSale" if str(listing.listing_type or "rent").lower() == "sale" else "PropertyForRent"
    return (
        f"{facts}\n\n{narrative}\n\n"
        "🔑 Discover properties on Saka Krib — Kenya's home marketplace.\n\n"
        f"#SakaKrib #KenyaRealEstate #{city_tag} #{property_tag}"
    )


def _gemini_caption(listing, rows=None):
    rows = rows if rows is not None else _unit_rows(listing)
    narrative = _gemini_narrative(listing, rows)
    if not narrative:
        return None
    facts = _multi_unit_facts(listing, rows) if rows else _single_listing_facts(listing)
    city_tag = "".join(char for char in str(listing.city or "Kenya").title() if char.isalnum()) or "Kenya"
    property_tag = (
        "PropertyUnits" if rows else
        ("PropertyForSale" if str(listing.listing_type or "rent").lower() == "sale" else "PropertyForRent")
    )
    return (
        f"{facts}\n\n{narrative}\n\n"
        "🔑 Discover properties on Saka Krib — Kenya's home marketplace.\n\n"
        f"#SakaKrib #KenyaRealEstate #{city_tag} #{property_tag}"
    )


@transaction.atomic
def generate_listing_caption(user, listing_id):
    listing = Listing.objects.select_for_update().filter(pk=listing_id).first()
    if not listing:
        raise LookupError("Listing not found.")
    if not is_admin(user) and str(listing.user_id) != str(user.pk):
        raise PermissionError("You may only generate a caption for your own listing.")

    rows = _unit_rows(listing)
    caption = _gemini_caption(listing, rows) or _fallback_caption(listing, rows)
    listing.ai_caption = caption
    listing.ai_caption_generated_at = timezone.now()
    listing.save(update_fields=["ai_caption", "ai_caption_generated_at", "updated_at"])
    return listing, caption
