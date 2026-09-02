from datetime import timedelta
from django.core.exceptions import ValidationError
from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import Profile
from apps.listings.models import Listing

from .domain_bookings import Booking, MoverScheduleEvent
from .domain_property import ListingMedia, PropertyUnit, RenterUnitAssociation, LandlordPaymentMethod
from .domain_rent import RentInvoice, RentPayment, RentPaymentSubmission
from .renter_services import (
    cancel_renter_invitation,
    claim_renter_invitation,
    create_renter_invitation,
    preview_renter_invitation,
    resend_renter_invitation,
)


def _error(exc):
    return Response({"detail": getattr(exc, "message", None) or str(exc)}, status=status.HTTP_400_BAD_REQUEST)


def _invoice_payload(row):
    return {
        "id": str(row.id),
        "invoice_number": row.invoice_number,
        "landlord_id": str(row.landlord_id),
        "renter_user_id": str(row.renter_user_id),
        "renter_assoc_id": str(row.renter_assoc_id),
        "listing_id": str(row.listing_id),
        "unit_id": str(row.unit_id),
        "billing_period_start": row.billing_period_start,
        "billing_period_end": row.billing_period_end,
        "due_date": row.due_date,
        "amount_kes": row.amount_kes,
        "currency": row.currency,
        "status": row.status,
        "payment_method_id": str(row.payment_method_id) if row.payment_method_id else None,
        "payment_destination_snapshot": row.payment_destination_snapshot,
        "paid_at": row.paid_at,
        "confirmed_by": str(row.confirmed_by) if row.confirmed_by else None,
        "confirmed_at": row.confirmed_at,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


def _submission_payload(row):
    return {
        "id": str(row.id),
        "invoice_id": str(row.invoice_id),
        "renter_user_id": str(row.renter_user_id),
        "landlord_id": str(row.landlord_id),
        "renter_assoc_id": str(row.renter_assoc_id),
        "unit_id": str(row.unit_id),
        "transaction_reference": row.transaction_reference,
        "status": row.status,
        "submitted_at": row.submitted_at,
        "confirmed_by": str(row.confirmed_by) if row.confirmed_by else None,
        "confirmed_at": row.confirmed_at,
        "rejection_reason": row.rejection_reason,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


class RenterDashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        association = RenterUnitAssociation.objects.filter(
            renter_user_id=request.user.pk, status="ACTIVE"
        ).order_by("-created_at").first()
        invoices = RentInvoice.objects.filter(
            renter_user_id=request.user.pk
        ).order_by("-due_date")
        bookings = Booking.objects.filter(
            renter_id=request.user.pk
        ).order_by("moving_date")
        if association is None:
            return Response({"association": None, "unit": None, "property": None,
                             "invoices": [_invoice_payload(x) for x in invoices],
                             "bookings": [_booking_payload(x) for x in bookings]})

        unit = PropertyUnit.objects.filter(id=association.unit_id).first()
        unit_payload = None
        property_payload = None
        if unit:
            unit_payload = {
                "id": str(unit.id), "listing_id": str(unit.listing_id), "unit_number": unit.unit_number,
                "unit_type": unit.unit_type, "rent": unit.rent, "deposit_amount": unit.deposit_amount,
                "size": unit.size, "beds": unit.beds, "baths": unit.baths, "availability": unit.availability,
                "description": unit.description, "rent_due_day": unit.rent_due_day,
                "rent_paid_in_advance": unit.rent_paid_in_advance,
                "rent_paid_through_month": unit.rent_paid_through_month,
            }
            listing = Listing.objects.filter(id=unit.listing_id).first()
            if listing:
                media = ListingMedia.objects.filter(
                    listing_id=listing.id, media_type="photo"
                ).order_by("position", "created_at").first()
                property_payload = {
                    "id": str(listing.id), "title": listing.title, "city": listing.city,
                    "county": listing.county, "address": None,
                    "cover_image_url": media.url if media else None,
                }

        association_payload = {
            "id": str(association.id), "renter_user_id": str(association.renter_user_id) if association.renter_user_id else None,
            "unit_id": str(association.unit_id), "landlord_id": str(association.landlord_id),
            "status": association.status, "rent_amount": association.rent_amount,
            "lease_start": association.lease_start, "lease_end": association.lease_end,
        }
        return Response({
            "association": association_payload,
            "unit": unit_payload,
            "property": property_payload,
            "invoices": [_invoice_payload(x) for x in invoices],
            "bookings": [_booking_payload(x) for x in bookings],
        })


BOOKING_FIELDS = (
    "id", "renter_id", "mover_id", "listing_id", "pickup_address", "dropoff_address", "moving_date",
    "booking_amount", "commission_amount", "total_amount", "status", "payment_status", "payment_method",
    "distance_km", "rate_per_km_kes", "base_rate_kes", "pickup_latitude", "pickup_longitude",
    "dropoff_latitude", "dropoff_longitude", "requested_at", "request_expires_at", "confirmed_at",
    "tracking_number", "last_known_latitude", "last_known_longitude", "last_location_at", "scheduled_start_at",
    "scheduled_end_at", "started_at", "renter_confirmed_delivery_at", "mover_confirmed_delivery_at",
    "contact_released_at", "dispute_status", "completed_at", "cancelled_at", "cancellation_reason",
    "cancellation_details", "created_at", "updated_at",
)


def _booking_payload(row):
    return {field: (str(getattr(row, field)) if field in {"id", "renter_id", "mover_id", "listing_id"} and getattr(row, field) is not None else getattr(row, field)) for field in BOOKING_FIELDS}


class RenterInvoiceView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, invoice_id=None):
        queryset = RentInvoice.objects.filter(renter_user_id=request.user.pk)
        if invoice_id is not None:
            row = queryset.filter(pk=invoice_id).first()
            if row is None:
                return Response({"detail": "Invoice not found."}, status=404)
            return Response(_invoice_payload(row))
        return Response([_invoice_payload(x) for x in queryset.order_by("-due_date")])


class RenterPaymentSubmissionView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, invoice_id):
        if not RentInvoice.objects.filter(pk=invoice_id, renter_user_id=request.user.pk).exists():
            return Response({"detail": "Invoice not found or not accessible."}, status=404)
        rows = RentPaymentSubmission.objects.filter(
            invoice_id=invoice_id, renter_user_id=request.user.pk
        ).order_by("-submitted_at")
        return Response([_submission_payload(x) for x in rows])


class RenterPaymentDestinationView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        payment_method_id = request.data.get("payment_method_id")
        unit_id = request.data.get("unit_id")
        if not payment_method_id or not unit_id:
            return _error(ValidationError("Payment method and unit are required."))
        unit = PropertyUnit.objects.filter(pk=unit_id).first()
        if unit is None:
            return _error(ValidationError("Unit not found."))
        is_admin = bool(getattr(request.user, "is_staff", False) or getattr(request.user, "is_superuser", False) or getattr(request.user, "role", None) == "admin")
        is_active_renter = RenterUnitAssociation.objects.filter(
            unit_id=unit.id, renter_user_id=request.user.pk, status="ACTIVE"
        ).exists()
        if str(unit.user_id) != str(request.user.pk) and not is_active_renter and not is_admin:
            return Response({"detail": "Not authorized to view this payment destination."}, status=403)
        method = LandlordPaymentMethod.objects.filter(
            pk=payment_method_id, landlord_id=unit.user_id, is_active=True
        ).first()
        if method is None:
            return _error(ValidationError("Payment method is not authorized for this unit."))
        return Response({
            "payment_method_id": str(method.id), "provider": method.provider,
            "mpesa_method": method.mpesa_method, "display_name": method.display_name,
            "paybill_number": method.paybill_number, "paybill_account": method.paybill_account,
            "till_number": method.till_number, "paypal_email": method.paypal_email,
        })


class RenterRentSummaryView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        assoc_id = request.data.get("renter_assoc_id")
        association = RenterUnitAssociation.objects.filter(
            pk=assoc_id, renter_user_id=request.user.pk, status="ACTIVE"
        ).first()
        if association is None:
            return _error(ValidationError("Active renter association not found."))
        unit = PropertyUnit.objects.filter(pk=association.unit_id).first()
        listing = Listing.objects.filter(pk=unit.listing_id).first() if unit else None
        paid = RentPayment.objects.filter(
            renter_assoc_id=association.id, status="PAID"
        ).order_by("-period_year", "-period_month").first()
        paid_through = None
        if paid:
            paid_through = f"{paid.period_year:04d}-{paid.period_month:02d}-01"
            next_year = paid.period_year + (1 if paid.period_month == 12 else 0)
            next_month = 1 if paid.period_month == 12 else paid.period_month + 1
        else:
            today = timezone.localdate()
            next_year, next_month = today.year, today.month
        landlord = Profile.objects.filter(pk=association.landlord_id).first()
        return Response({
            "association_id": str(association.id), "unit_id": str(association.unit_id),
            "listing_id": str(unit.listing_id) if unit else None, "unit_number": unit.unit_number if unit else None,
            "rent": unit.rent if unit else association.rent_amount,
            "rent_due_day": unit.rent_due_day if unit else None,
            "payment_tracking_enabled": bool(unit.payment_tracking_enabled) if unit else False,
            "property_name": listing.property_name if listing else None,
            "listing_title": listing.title if listing else None,
            "landlord_id": str(association.landlord_id), "paid_through": paid_through,
            "next_payment_period": f"{next_year:04d}-{next_month:02d}",
            "landlord_name": landlord.full_name if landlord else None,
        })


class RenterPaymentHistoryView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        assoc_id = request.data.get("assoc_id")
        if not RenterUnitAssociation.objects.filter(pk=assoc_id, renter_user_id=request.user.pk).exists():
            return _error(ValidationError("Renter association not found or not accessible."))
        rows = RentPayment.objects.filter(
            renter_assoc_id=assoc_id
        ).order_by("-period_year", "-period_month")
        return Response([{
            "id": str(x.id), "amount_kes": x.amount_kes, "period_year": x.period_year,
            "period_month": x.period_month, "status": x.status, "payment_provider": x.payment_provider,
            "payment_method": x.payment_method, "mpesa_receipt": x.mpesa_receipt,
            "paid_at": x.paid_at, "created_at": x.created_at,
        } for x in rows])


class RenterMoverScheduleAvailabilityView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        booking_id = request.data.get("booking_id")
        try:
            start = timezone.datetime.fromisoformat(str(request.data.get("from")).replace("Z", "+00:00"))
            end = timezone.datetime.fromisoformat(str(request.data.get("to")).replace("Z", "+00:00"))
        except (TypeError, ValueError):
            return _error(ValidationError("Invalid availability range."))
        if start.tzinfo is None:
            start = timezone.make_aware(start)
        if end.tzinfo is None:
            end = timezone.make_aware(end)
        if end <= start or end - start > timedelta(days=93):
            return _error(ValidationError("Invalid availability range."))
        booking = Booking.objects.filter(pk=booking_id).first()
        if booking is None:
            return Response({"detail": "Booking not found or unauthorized."}, status=404)
        mover = __import__("apps.core.domain_platform", fromlist=["Mover"]).Mover.objects.filter(pk=booking.mover_id).first()
        if mover is None or (str(booking.renter_id) != str(request.user.pk) and str(mover.user_id) != str(request.user.pk)):
            return Response({"detail": "Booking not found or unauthorized."}, status=404)
        if booking.status not in {"confirmed", "pending"}:
            return _error(ValidationError("Booking is not eligible for schedule availability."))
        events = MoverScheduleEvent.objects.filter(
            mover_id=booking.mover_id, status__in=["TENTATIVE", "CONFIRMED"],
            starts_at__lt=end, ends_at__gt=start,
        ).exclude(booking_id=booking.id).order_by("starts_at")
        return Response({
            "booking_id": str(booking.id), "mover_id": str(booking.mover_id),
            "working_days": mover.working_days, "start_time": mover.start_time, "end_time": mover.end_time,
            "blocked_intervals": [{"starts_at": x.starts_at, "ends_at": x.ends_at, "status": x.status} for x in events],
        })


class RenterInvitationCreateView(APIView):
    def post(self, request):
        try:
            return Response(create_renter_invitation(
                landlord_id=request.user.id, unit_id=request.data.get("unit_id"),
                renter_name=request.data.get("renter_name"), renter_phone=request.data.get("renter_phone"),
                renter_email=request.data.get("renter_email"), app_base_url=request.data.get("app_base_url")), status=status.HTTP_201_CREATED)
        except (ValidationError, TypeError, ValueError) as exc:
            return _error(exc)


class RenterInvitationPreviewView(APIView):
    authentication_classes = []
    permission_classes = []

    def get(self, request, token):
        try:
            return Response(preview_renter_invitation(token=token), status=status.HTTP_200_OK)
        except (ValidationError, TypeError, ValueError) as exc:
            return _error(exc)


class RenterInvitationClaimView(APIView):
    def post(self, request, token):
        try:
            return Response(claim_renter_invitation(renter_user_id=request.user.id, token=token), status=status.HTTP_200_OK)
        except (ValidationError, TypeError, ValueError) as exc:
            return _error(exc)


class RenterInvitationResendView(APIView):
    def post(self, request, association_id):
        try:
            return Response(resend_renter_invitation(
                landlord_id=request.user.id, association_id=association_id,
                app_base_url=request.data.get("app_base_url")), status=status.HTTP_200_OK)
        except (ValidationError, TypeError, ValueError) as exc:
            return _error(exc)


class RenterInvitationCancelView(APIView):
    def post(self, request, association_id):
        try:
            return Response(cancel_renter_invitation(
                landlord_id=request.user.id, association_id=association_id), status=status.HTTP_200_OK)
        except (ValidationError, TypeError, ValueError) as exc:
            return _error(exc)
