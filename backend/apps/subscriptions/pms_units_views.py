from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.domain_property import PropertyUnit, RenterUnitAssociation
from apps.listings.models import Listing

from .models import LandlordSubscription, RealEstateSubscription, SubscriptionListing


class MyPMSUnitsView(APIView):
    """Django equivalent of the legacy get_my_pms_units RPC.

    A unit is visible only when the requested listing belongs to the
    authenticated PMS owner and is actively attached to that owner's current
    PMS subscription.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        listing_id = request.query_params.get("listing_id")
        if not listing_id:
            return Response({"detail": "listing_id is required."}, status=400)

        profile = request.user
        if profile.role == "landlord":
            subscription = (
                LandlordSubscription.objects.filter(landlord_id=profile.id, status="ACTIVE")
                .order_by("-created_at")
                .first()
            )
            link = SubscriptionListing.objects.filter(
                subscription_id=subscription.id if subscription else None,
                listing_id=listing_id,
                status="ACTIVE",
            ).first() if subscription else None
        elif profile.role == "real_estate":
            subscription = (
                RealEstateSubscription.objects.filter(real_estate_id=profile.id, status="ACTIVE")
                .order_by("-created_at")
                .first()
            )
            link = SubscriptionListing.objects.filter(
                real_estate_subscription_id=subscription.id if subscription else None,
                listing_id=listing_id,
                status="ACTIVE",
            ).first() if subscription else None
        else:
            return Response({"detail": "PMS access is available only to landlord and real-estate accounts."}, status=403)

        if not link:
            return Response({"detail": "Listing is not managed by your active PMS subscription."}, status=404)

        if not Listing.objects.filter(id=listing_id, user_id=profile.id).exists():
            return Response({"detail": "Listing not found."}, status=404)

        units = PropertyUnit.objects.filter(listing_id=listing_id, user_id=profile.id).order_by("position", "created_at")
        association_rows = RenterUnitAssociation.objects.filter(unit_id__in=units.values("id"))
        association_by_unit = {str(row.unit_id): row for row in association_rows}

        result = []
        for unit in units:
            association = association_by_unit.get(str(unit.id))
            result.append({
                "unit_id": str(unit.id),
                "listing_id": str(unit.listing_id),
                "listing_title": Listing.objects.filter(pk=unit.listing_id).values_list("title", flat=True).first() or "",
                "unit_number": unit.unit_number,
                "unit_type": unit.unit_type,
                "rent": unit.rent,
                "beds": unit.beds,
                "baths": unit.baths,
                "availability": unit.availability,
                "renter_name": association.renter_name if association else None,
                "renter_assoc_id": str(association.id) if association else None,
                "renter_phone": association.renter_phone if association else None,
                "renter_email": association.renter_email if association else None,
                "lease_start": association.lease_start if association else None,
                "lease_end": association.lease_end if association else None,
                "assoc_status": association.status if association else None,
            })
        return Response(result)
