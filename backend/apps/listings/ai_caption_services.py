import json
import urllib.error
import urllib.request

from django.conf import settings
from django.db import transaction

from .models import Listing


def _fallback_caption(listing: Listing) -> str:
    price = f"{listing.price_kes:,.0f}" if listing.price_kes is not None else "0"
    type_label = "FOR SALE" if listing.listing_type == "sale" else "FOR RENT"
    deposit_info = " | Deposit required" if listing.deposit_required else " | No deposit"
    size = listing.size or "Not specified"
    beds = listing.beds if listing.beds is not None else 0
    baths = listing.baths if listing.baths is not None else 0
    city_tag = (listing.city or "Kenya").replace(" ", "")
    property_tag = "HouseForSale" if listing.listing_type == "sale" else "HouseForRent"
    return (
        f"🏠 {type_label}: {listing.title}\n\n"
        f"📍 Location: {listing.city}, {listing.county}\n"
        f"💰 Price: KES {price}{'/month' if listing.listing_type == 'rent' else ''}\n"
        f"🛏️ Size: {size} ({beds} bed, {baths} bath){deposit_info}\n\n"
        f"{listing.description}\n\n"
        "🔑 Verified listing on Saka Krib — Kenya's trusted home marketplace.\n"
        "Find your next home effortlessly at Saka Krib.\n\n"
        f"#SakaKrib #KenyaRealEstate #{city_tag} #{property_tag}"
    )


def _gemini_caption(listing: Listing) -> str | None:
    api_key = str(getattr(settings, "GEMINI_API_KEY", "") or "").strip()
    if not api_key:
        return None

    price = f"{listing.price_kes:,.0f}" if listing.price_kes is not None else "0"
    prompt = (
        "You are a real estate social media expert. Create an engaging, professional "
        "LinkedIn-style community post for this property listing in Kenya. Make it warm, "
        "informative, and exciting. Use emojis tastefully. Keep it under 300 words.\n\n"
        f"Title: {listing.title}\n"
        f"Location: {listing.city}, {listing.county}\n"
        f"Price: KES {price} {'per month' if listing.listing_type == 'rent' else ''}\n"
        f"Type: {listing.listing_type}\n"
        f"Size: {listing.size or 'Not specified'}\n"
        f"Bedrooms: {listing.beds or 0}\n"
        f"Bathrooms: {listing.baths or 0}\n"
        f"Deposit: {'Required' if listing.deposit_required else 'Not required'}\n"
        f"Description: {listing.description}\n\n"
        "Generate a compelling social media post:"
    )
    payload = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.7, "maxOutputTokens": 300},
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
        caption = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
        return str(caption).strip() or None
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError, KeyError, IndexError):
        return None


@transaction.atomic
def generate_listing_caption(user, listing_id):
    listing = Listing.objects.select_for_update().filter(pk=listing_id).first()
    if not listing:
        raise LookupError("Listing not found.")
    if not getattr(user, "is_admin", False) and str(listing.user_id) != str(user.pk):
        raise PermissionError("You may only generate a caption for your own listing.")

    caption = _gemini_caption(listing) or _fallback_caption(listing)
    listing.ai_caption = caption
    from django.utils import timezone
    listing.ai_caption_generated_at = timezone.now()
    listing.save(update_fields=["ai_caption", "ai_caption_generated_at", "updated_at"])
    return listing, caption
