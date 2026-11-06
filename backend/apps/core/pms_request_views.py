"""Rental-request inbox for PMS owners (landlords and real-estate accounts).

Renters request a vacant unit (see ``renter_services.create_renter_unit_request``); the owner
sees those requests here and can accept or decline with an optional reply that is pushed to the
renter.
"""
from django.db import transaction
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.listings.models import Listing

from .domain_property import PropertyUnit, RenterUnitAssociation
from .notification_services import dispatch_user_notification
from .rent_views import _pms_actor


def _request_payload(row, unit, listing):
    return {
        "id": str(row.id), "unit_id": str(row.unit_id),
        "unit_number": unit.unit_number if unit else None,
        "listing_id": str(unit.listing_id) if unit else None,
        "listing_title": (listing.title if listing else "") or "",
        "renter_name": row.renter_name, "renter_email": row.renter_email, "renter_phone": row.renter_phone,
        "rent_amount": float(row.rent_amount or 0), "status": row.status,
        "created_at": row.created_at, "expires_at": row.invite_expires_at,
    }


class PMSRentalRequestsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        owner_id, denied = _pms_actor(request)
        if denied:
            return denied
        now = timezone.now()
        rows = [
            r for r in RenterUnitAssociation.objects.filter(landlord_id=owner_id, status="PENDING", renter_user_id__isnull=False).order_by("-created_at")
            if not r.invite_expires_at or r.invite_expires_at > now
        ]
        units = {u.id: u for u in PropertyUnit.objects.filter(id__in=[r.unit_id for r in rows])}
        listings = {l.id: l for l in Listing.objects.filter(id__in={u.listing_id for u in units.values()})}
        return Response([
            _request_payload(r, units.get(r.unit_id), listings.get(units[r.unit_id].listing_id) if r.unit_id in units else None)
            for r in rows
        ])


class PMSRentalRequestRespondView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, association_id):
        owner_id, denied = _pms_actor(request)
        if denied:
            return denied
        action = str(request.data.get("action") or "").strip().lower()
        message = str(request.data.get("message") or "").strip()[:500]
        if action not in ("accept", "decline"):
            return Response({"detail": "action must be 'accept' or 'decline'."}, status=400)
        row = RenterUnitAssociation.objects.select_for_update().filter(
            pk=association_id, landlord_id=owner_id, status="PENDING", renter_user_id__isnull=False
        ).first()
        if row is None:
            return Response({"detail": "This request is no longer pending."}, status=404)
        unit = PropertyUnit.objects.select_for_update().filter(pk=row.unit_id).first()
        if unit is None:
            return Response({"detail": "Unit not found."}, status=404)
        listing = Listing.objects.filter(pk=unit.listing_id).first()
        place = f"Unit {unit.unit_number} at {listing.title if listing else 'the property'}"
        now = timezone.now()
        if action == "accept":
            if RenterUnitAssociation.objects.filter(unit_id=unit.id, status="ACTIVE").exists():
                return Response({"detail": "This unit already has an active renter."}, status=400)
            row.status = "ACTIVE"
            row.claimed_at = now
            row.lease_start = row.lease_start or now.date()
            row.invite_expires_at = None
            unit.availability = "occupied"
            unit.save(update_fields=["availability", "updated_at"])
            title, body = "Rental request accepted", f"Your request for {place} was accepted."
        else:
            row.status = "DECLINED"
            title, body = "Rental request declined", f"Your request for {place} was declined."
        if message:
            body += f" Message from the owner: {message}"
        row.updated_at = now
        row.save()
        dispatch_user_notification(
            user_id=row.renter_user_id, notification_type="RENTER_UNIT_REQUEST_" + action.upper(),
            title=title, message=body,
            data={"association_id": str(row.id), "unit_id": str(unit.id)},
            event_key=f"renter-unit-request-{action}:{row.id}",
        )
        return Response({"id": str(row.id), "status": row.status})
