from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.authorization import can_manage_listings
from apps.listings.models import Listing
from apps.subscriptions.services import get_current_subscription, get_subscription_plan

from .domain_property import PropertyUnit, RenterUnitAssociation
from .domain_rent import RentInvoice


def _require_landlord(request):
    if not can_manage_listings(request.user) or str(getattr(request.user, "role", "")).lower() != "landlord":
        return Response({"detail": "Landlord PMS access is required."}, status=403)
    return None


def _unit_payload(unit):
    association = RenterUnitAssociation.objects.filter(unit_id=unit.id, status__iexact="ACTIVE").order_by("-created_at").first()
    listing = Listing.objects.filter(id=unit.listing_id).first()
    return {
        "unit_id": str(unit.id), "listing_id": str(unit.listing_id),
        "listing_title": listing.title if listing else "", "unit_number": unit.unit_number,
        "unit_type": unit.unit_type, "rent": float(Decimal(unit.rent)), "deposit_amount": float(Decimal(unit.deposit_amount)),
        "size": unit.size, "beds": unit.beds, "baths": unit.baths, "availability": unit.availability,
        "description": unit.description, "position": unit.position,
        "payment_tracking_enabled": bool(unit.payment_tracking_enabled), "rent_due_day": unit.rent_due_day,
        "rent_paid_in_advance": bool(unit.rent_paid_in_advance),
        "rent_paid_through_month": unit.rent_paid_through_month.isoformat() if unit.rent_paid_through_month else None,
        "renter_name": association.renter_name if association else None,
        "renter_assoc_id": str(association.id) if association else None,
        "renter_user_id": str(association.renter_user_id) if association and association.renter_user_id else None,
        "renter_phone": association.renter_phone if association else None,
        "renter_email": association.renter_email if association else None,
        "lease_start": association.lease_start if association else None,
        "lease_end": association.lease_end if association else None,
    }


class LandlordPMSRenterRequestsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        denied = _require_landlord(request)
        if denied:
            return denied
        rows = RenterUnitAssociation.objects.filter(landlord_id=request.user.id, status="PENDING").order_by("-created_at")
        return Response([{
            "id": str(row.id), "unit_id": str(row.unit_id), "renter_name": row.renter_name,
            "renter_phone": row.renter_phone, "renter_email": row.renter_email,
            "rent_amount": str(row.rent_amount), "invited_at": row.invited_at,
            "invite_expires_at": row.invite_expires_at,
        } for row in rows])


class LandlordPMSUnitView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, unit_id=None):
        denied = _require_landlord(request)
        if denied:
            return denied
        qs = PropertyUnit.objects.filter(user_id=request.user.id)
        if unit_id:
            unit = qs.filter(pk=unit_id).first()
            if not unit:
                return Response({"detail": "Unit not found."}, status=404)
            return Response(_unit_payload(unit))
        return Response([_unit_payload(unit) for unit in qs.order_by("position", "created_at")])

    @transaction.atomic
    def post(self, request, unit_id=None):
        denied = _require_landlord(request)
        if denied:
            return denied
        listing = Listing.objects.filter(
            pk=request.data.get("listing_id"), user_id=request.user.id,
            is_property_management=True, is_approved=True,
        ).first()
        if not listing:
            return Response({"detail": "An approved property-management listing owned by this landlord is required."}, status=400)
        subscription = get_current_subscription(request.user)
        plan = get_subscription_plan(subscription)
        if not subscription or subscription.status != "ACTIVE":
            return Response({"detail": "An ACTIVE PMS subscription is required to add units."}, status=403)
        if plan and plan.max_units_per_listing is not None and PropertyUnit.objects.filter(listing_id=listing.id, user_id=request.user.id).count() >= plan.max_units_per_listing:
            return Response({"detail": "This listing has reached the unit capacity for the active subscription plan."}, status=400)
        unit = PropertyUnit.objects.create(
            listing_id=listing.id, user_id=request.user.id,
            unit_number=str(request.data.get("unit_number") or "").strip(),
            unit_type=str(request.data.get("unit_type") or "unit").strip(),
            rent=Decimal(str(request.data.get("rent") or "0")),
            deposit_amount=Decimal(str(request.data.get("deposit_amount") or "0")),
            size=request.data.get("size"), beds=int(request.data.get("beds") or 1), baths=int(request.data.get("baths") or 1),
            availability=str(request.data.get("availability") or "available").strip(),
            description=request.data.get("description"), position=int(request.data.get("position") or 0),
            payment_tracking_enabled=bool(request.data.get("payment_tracking_enabled", True)),
            rent_due_day=int(request.data.get("rent_due_day") or 1),
        )
        if not unit.unit_number or unit.rent <= 0 or unit.rent_due_day not in range(1, 32):
            raise ValidationError("Unit number, positive rent, and a valid rent due day are required.")
        return Response(_unit_payload(unit), status=201)

    @transaction.atomic
    def patch(self, request, unit_id):
        denied = _require_landlord(request)
        if denied:
            return denied
        unit = PropertyUnit.objects.select_for_update().filter(pk=unit_id, user_id=request.user.id).first()
        if not unit:
            return Response({"detail": "Unit not found."}, status=404)
        for field in ("unit_number", "unit_type", "size", "availability", "description"):
            if field in request.data:
                setattr(unit, field, request.data[field])
        if "rent" in request.data:
            unit.rent = Decimal(str(request.data["rent"]))
        if "deposit_amount" in request.data:
            unit.deposit_amount = Decimal(str(request.data["deposit_amount"]))
        if "beds" in request.data:
            unit.beds = int(request.data["beds"])
        if "baths" in request.data:
            unit.baths = int(request.data["baths"])
        if "rent_due_day" in request.data:
            unit.rent_due_day = int(request.data["rent_due_day"])
        if "payment_tracking_enabled" in request.data:
            unit.payment_tracking_enabled = bool(request.data["payment_tracking_enabled"])
        unit.updated_at = timezone.now()
        if not unit.unit_number or unit.rent <= 0 or unit.rent_due_day not in range(1, 32):
            raise ValidationError("Unit number, positive rent, and a valid rent due day are required.")
        unit.save()
        return Response(_unit_payload(unit))

    @transaction.atomic
    def delete(self, request, unit_id):
        denied = _require_landlord(request)
        if denied:
            return denied
        unit = PropertyUnit.objects.select_for_update().filter(pk=unit_id, user_id=request.user.id).first()
        if not unit:
            return Response({"detail": "Unit not found."}, status=404)
        if RenterUnitAssociation.objects.filter(unit_id=unit.id, status="ACTIVE").exists():
            return Response({"detail": "This unit has an active renter. Remove or end the renter association before deleting the unit."}, status=409)
        if RentInvoice.objects.filter(unit_id=unit.id).exists():
            return Response({"detail": "This unit has rent invoice history and cannot be permanently deleted."}, status=409)
        RenterUnitAssociation.objects.filter(unit_id=unit.id).delete()
        unit.delete()
        return Response({"success": True})


class LandlordPMSRenterManageView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def delete(self, request, association_id):
        denied = _require_landlord(request)
        if denied:
            return denied
        row = RenterUnitAssociation.objects.select_for_update().filter(pk=association_id, landlord_id=request.user.id, status="ACTIVE").first()
        if not row:
            return Response({"detail": "Active renter association not found."}, status=404)
        row.status = "INACTIVE"
        row.updated_at = timezone.now()
        row.save(update_fields=["status", "updated_at"])
        PropertyUnit.objects.filter(pk=row.unit_id, user_id=request.user.id).update(availability="available", updated_at=timezone.now())
        return Response({"success": True, "status": "INACTIVE"})
