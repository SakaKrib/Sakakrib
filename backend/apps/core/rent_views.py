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
    """Backwards-compatible gate; prefer _pms_actor() which also resolves the owner account."""
    return _pms_actor(request)[1]


def _pms_actor(request, allow_read_only=False):
    """Resolve who may act on rent records and on whose behalf.

    Returns (owner_id, error_response). Landlords act for themselves. A real-estate owner, or a
    team member whose PMS role is ADMIN or TEAM_MANAGER, acts for the real-estate account.
    Agents are read-only. Read-only grace periods block every change.
    """
    user = request.user
    if is_admin(user):
        return user.id, None
    role = str(getattr(user, "role", "") or "").lower()
    if role == "landlord":
        access = pms_access(user)
        if not access.get("allowed"):
            return None, Response({"detail": "Landlord PMS access is required.", "pms_access": access}, status=status.HTTP_403_FORBIDDEN)
        if access.get("read_only") and not allow_read_only:
            return None, Response({"detail": "PMS is read-only during the subscription grace period.", "pms_access": access}, status=status.HTTP_403_FORBIDDEN)
        return user.id, None
    from apps.subscriptions.services import get_real_estate_pms_context
    context = get_real_estate_pms_context(user)
    if not context:
        return None, Response({"detail": "PMS access is required."}, status=status.HTTP_403_FORBIDDEN)
    if getattr(context.get("subscription"), "status", "") == "GRACE_PERIOD" and not allow_read_only:
        return None, Response({"detail": "PMS is read-only during the subscription grace period."}, status=status.HTTP_403_FORBIDDEN)
    if context.get("pms_role") not in ("ADMIN", "TEAM_MANAGER"):
        return None, Response({"detail": "Your PMS role cannot manage invoices or confirm payments."}, status=status.HTTP_403_FORBIDDEN)
    return context["owner_id"], None


class LandlordRentInvoiceCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        owner_id, denied = _pms_actor(request)
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
                landlord_id=owner_id,
                unit_id=request.data.get("unit_id"),
                renter_assoc_id=request.data.get("renter_assoc_id"),
                periods=periods,
                due_date=_date(request.data.get("due_date"), "due_date"),
                payment_method_id=request.data.get("payment_method_id"),
                billing_period_start=_date(billing_start, "billing_period_start") if billing_start else None,
                billing_period_end=_date(billing_end, "billing_period_end") if billing_end else None,
                transaction_reference=request.data.get("transaction_reference"),
                payment_method=request.data.get("payment_method"),
                payment_date=_date(request.data.get("payment_date"), "payment_date") if request.data.get("payment_date") else None,
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
        owner_id, denied = _pms_actor(request)
        if denied:
            return denied
        try:
            result = confirm_rent_payment(landlord_id=owner_id, submission_id=submission_id)
            return Response(result, status=status.HTTP_200_OK)
        except (ValidationError, TypeError, ValueError) as exc:
            return _error(exc)


class LandlordRentPaymentRejectView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, submission_id):
        owner_id, denied = _pms_actor(request)
        if denied:
            return denied
        try:
            result = reject_rent_payment(
                landlord_id=owner_id,
                submission_id=submission_id,
                rejection_reason=request.data.get("rejection_reason", ""),
            )
            return Response(result, status=status.HTTP_200_OK)
        except (ValidationError, TypeError, ValueError) as exc:
            return _error(exc)
