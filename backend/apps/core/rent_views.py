from datetime import date

from django.core.exceptions import ValidationError
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.authorization import is_admin, pms_access

from .rent_services import (
    confirm_rent_payment,
    create_landlord_rent_invoice,
    create_renter_paid_invoice,
    reject_rent_payment,
    submit_invoice_payment,
)


def _date(value, field_name):
    try:
        return date.fromisoformat(str(value))
    except (TypeError, ValueError) as exc:
        raise ValidationError(f"{field_name} must be an ISO date (YYYY-MM-DD).") from exc


def _error(exc):
    detail = getattr(exc, "message", None) or str(exc)
    return Response({"detail": detail}, status=status.HTTP_400_BAD_REQUEST)


def _require_active_landlord(request):
    if is_admin(request.user):
        return None
    access = pms_access(request.user)
    if not access.get("allowed") or access.get("role") != "landlord":
        return Response({"detail": "Landlord PMS access is required.", "pms_access": access}, status=status.HTTP_403_FORBIDDEN)
    if access.get("read_only"):
        return Response({"detail": "PMS is read-only during the subscription grace period.", "pms_access": access}, status=status.HTTP_403_FORBIDDEN)
    return None


class LandlordRentInvoiceCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        denied = _require_active_landlord(request)
        if denied:
            return denied
        try:
            periods = request.data.get("periods")
            billing_start = request.data.get("billing_period_start")
            billing_end = request.data.get("billing_period_end")
            if periods is None and billing_start:
                billing_start = _date(billing_start, "billing_period_start")
                periods = [{"period_year": billing_start.year, "period_month": billing_start.month}]
            result = create_landlord_rent_invoice(
                landlord_id=request.user.id,
                unit_id=request.data.get("unit_id"),
                renter_assoc_id=request.data.get("renter_assoc_id"),
                periods=periods,
                due_date=_date(request.data.get("due_date"), "due_date"),
                payment_method_id=request.data.get("payment_method_id"),
                billing_period_start=_date(billing_start, "billing_period_start") if billing_start else None,
                billing_period_end=_date(billing_end, "billing_period_end") if billing_end else None,
            )
            return Response(result, status=status.HTTP_201_CREATED)
        except (ValidationError, TypeError, ValueError) as exc:
            return _error(exc)


class RenterInvoicePaymentSubmitView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, invoice_id):
        try:
            payment_date = request.data.get("payment_date")
            result = submit_invoice_payment(
                renter_user_id=request.user.id,
                invoice_id=invoice_id,
                transaction_reference=request.data.get("transaction_reference", ""),
                payment_method=request.data.get("payment_method"),
                payment_date=_date(payment_date, "payment_date") if payment_date else None,
            )
            return Response(result, status=status.HTTP_201_CREATED)
        except (ValidationError, TypeError, ValueError) as exc:
            return _error(exc)


class RenterPaidInvoiceCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            result = create_renter_paid_invoice(
                renter_user_id=request.user.id,
                unit_id=request.data.get("unit_id"),
                payment_date=_date(request.data.get("payment_date"), "payment_date"),
                payment_method=request.data.get("payment_method", ""),
                transaction_reference=request.data.get("transaction_reference", ""),
            )
            return Response(result, status=status.HTTP_201_CREATED)
        except (ValidationError, TypeError, ValueError) as exc:
            return _error(exc)


class LandlordRentPaymentConfirmView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, submission_id):
        denied = _require_active_landlord(request)
        if denied:
            return denied
        try:
            result = confirm_rent_payment(landlord_id=request.user.id, submission_id=submission_id)
            return Response(result, status=status.HTTP_200_OK)
        except (ValidationError, TypeError, ValueError) as exc:
            return _error(exc)


class LandlordRentPaymentRejectView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, submission_id):
        denied = _require_active_landlord(request)
        if denied:
            return denied
        try:
            result = reject_rent_payment(
                landlord_id=request.user.id,
                submission_id=submission_id,
                rejection_reason=request.data.get("rejection_reason", ""),
            )
            return Response(result, status=status.HTTP_200_OK)
        except (ValidationError, TypeError, ValueError) as exc:
            return _error(exc)
