from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.authorization import is_admin
from apps.accounts.models import Profile
from apps.listings.models import Listing
from apps.subscriptions.services import get_pms_access

from .domain_property import PropertyUnit, RenterUnitAssociation
from .notification_services import dispatch_user_notification


class PropertyRentalOwnerRequestView(APIView):
    """Owner/PMS boundary for renter-originated property-unit requests."""
    permission_classes = [IsAuthenticated]

    def _allowed(self, request):
        if is_admin(request.user):
            return True, None
        role = str(getattr(request.user, "role", "")).lower()
        if role not in {"landlord", "real_estate"}:
            return False, Response({"detail": "PMS owner access is required."}, status=403)
        access = get_pms_access(request.user)
        if not access.get("allowed"):
            return False, Response({"detail": "Active PMS access is required.", "pms_access": access}, status=403)
        if access.get("read_only"):
            return False, Response({"detail": "PMS is read-only during the subscription grace period.", "pms_access": access}, status=403)
        return True, None

    def get(self, request):
        allowed, denied = self._allowed(request)
        if not allowed:
            return denied
        rows = RenterUnitAssociation.objects.filter(
            landlord_id=request.user.id,
            status="PENDING",
            renter_user_id__isnull=False,
        ).order_by("-created_at")
        return Response([
            {
                "id": str(row.id),
                "unit_id": str(row.unit_id),
                "renter_user_id": str(row.renter_user_id),
                "renter_name": row.renter_name,
                "renter_email": row.renter_email,
                "renter_phone": row.renter_phone,
                "rent_amount": row.rent_amount,
                "created_at": row.created_at,
                "expires_at": row.invite_expires_at,
            }
            for row in rows
        ])

    @transaction.atomic
    def patch(self, request, association_id):
        allowed, denied = self._allowed(request)
        if not allowed:
            return denied
        action = str(request.data.get("action") or "").strip().lower()
        if action not in {"accept", "reject"}:
            return Response({"detail": "action must be accept or reject."}, status=400)

        row = RenterUnitAssociation.objects.select_for_update().filter(
            pk=association_id,
            landlord_id=request.user.id,
            status="PENDING",
            renter_user_id__isnull=False,
        ).first()
        if row is None:
            return Response({"detail": "Pending rental request not found."}, status=404)
        if row.invite_expires_at and row.invite_expires_at <= timezone.now():
            row.status = "EXPIRED"
            row.updated_at = timezone.now()
            row.save(update_fields=["status", "updated_at"])
            return Response({"detail": "This rental request has expired."}, status=409)

        unit = PropertyUnit.objects.select_for_update().filter(pk=row.unit_id).first()
        if unit is None:
            return Response({"detail": "Property unit not found."}, status=404)
        listing = Listing.objects.filter(pk=unit.listing_id, user_id=request.user.id).first()
        if listing is None:
            return Response({"detail": "Property listing not found or not owned by this account."}, status=403)

        if action == "reject":
            row.status = "REJECTED"
            row.updated_at = timezone.now()
            row.save(update_fields=["status", "updated_at"])
            dispatch_user_notification(
                user_id=row.renter_user_id,
                notification_type="RENTAL_REQUEST_REJECTED",
                title="Rental request declined",
                message=f"Your request for Unit {unit.unit_number} at {listing.title} was declined.",
                data={"association_id": str(row.id), "unit_id": str(unit.id), "listing_id": str(listing.id)},
                event_key=f"rental-request-rejected:{row.id}",
            )
            return Response({"success": True, "status": row.status})

        if RenterUnitAssociation.objects.filter(unit_id=unit.id, status="ACTIVE").exclude(pk=row.id).exists():
            return Response({"detail": "This unit has already been taken."}, status=409)
        if str(unit.availability or "").strip().lower() in {"occupied", "unavailable", "rented", "leased"}:
            return Response({"detail": "This unit is no longer available."}, status=409)

        row.status = "ACTIVE"
        row.claimed_at = timezone.now()
        row.updated_at = timezone.now()
        row.lease_start = row.lease_start or timezone.localdate()
        row.save(update_fields=["status", "claimed_at", "updated_at", "lease_start"])
        unit.availability = "occupied"
        unit.updated_at = timezone.now()
        unit.save(update_fields=["availability", "updated_at"])

        dispatch_user_notification(
            user_id=row.renter_user_id,
            notification_type="RENTAL_REQUEST_ACCEPTED",
            title="Rental request accepted",
            message=f"Your request for Unit {unit.unit_number} at {listing.title} was accepted.",
            data={"association_id": str(row.id), "unit_id": str(unit.id), "listing_id": str(listing.id)},
            event_key=f"rental-request-accepted:{row.id}",
        )
        return Response({
            "success": True,
            "status": row.status,
            "association_id": str(row.id),
            "unit_id": str(unit.id),
            "listing_id": str(listing.id),
        })
