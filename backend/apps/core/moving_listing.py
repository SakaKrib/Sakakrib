from django.core.exceptions import ValidationError

from apps.listings.models import Listing


def resolve_moving_destination(*, listing_id, dropoff_address, dropoff_latitude, dropoff_longitude):
    """Resolve the booking destination from the listing when a listing is supplied.

    A listing-origin booking must never trust a client-supplied destination. The
    published/approved listing and its stored coordinates are authoritative.
    """
    if not listing_id:
        return {
            "dropoff_address": str(dropoff_address or "").strip(),
            "dropoff_latitude": dropoff_latitude,
            "dropoff_longitude": dropoff_longitude,
        }

    listing = Listing.objects.filter(
        pk=listing_id,
        is_published=True,
        is_draft=False,
        approval_status="approved",
        is_approved=True,
    ).first()
    if listing is None:
        raise ValidationError("The selected property listing is not approved or published")
    if listing.latitude is None or listing.longitude is None:
        raise ValidationError("The selected property listing does not have a valid map location")

    address_parts = [
        str(listing.location_search or "").strip(),
        str(listing.city or "").strip(),
        str(listing.county or "").strip(),
    ]
    authoritative_address = ", ".join(dict.fromkeys(part for part in address_parts if part))
    if not authoritative_address:
        raise ValidationError("The selected property listing does not have a usable destination address")

    return {
        "dropoff_address": authoritative_address,
        "dropoff_latitude": listing.latitude,
        "dropoff_longitude": listing.longitude,
    }
