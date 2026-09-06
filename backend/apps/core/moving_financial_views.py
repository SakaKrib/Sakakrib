from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .access_scopes import moving_financial_documents_for_user, bookings_for_user
from .domain_bookings import Booking
from .domain_financial import MovingFinancialDocument
from .moving_timeline_views import _timeline_for_booking
from apps.accounts.authorization import is_admin


FINANCIAL_DOCUMENT_FIELDS = (
    "id", "booking_id", "payment_id", "document_type", "document_number",
    "renter_id", "mover_id", "amount_kes", "platform_fee_kes", "mover_net_kes",
    "currency", "status", "payment_provider", "provider_reference",
    "provider_transaction_id", "mover_name_snapshot", "mover_phone_snapshot",
    "vehicle_type_snapshot", "number_plate_snapshot", "mover_profile_photo_snapshot",
    "issued_at", "paid_at", "released_at", "created_at", "updated_at",
)


class MovingFinancialDocumentView(APIView):
    """Read-only financial records scoped to renter, mover owner, or admin.

    The optional timeline=1 mode exposes the same scoped records as one
    chronological transaction timeline without changing the existing response
    contract for ordinary financial-document requests.
    """

    permission_classes = [IsAuthenticated]

    def serialize(self, document):
        return {field: getattr(document, field) for field in FINANCIAL_DOCUMENT_FIELDS}

    def get(self, request, object_id=None):
        if request.query_params.get("timeline") == "1":
            booking_id = request.query_params.get("booking_id")
            queryset = Booking.objects.all() if is_admin(request.user) else bookings_for_user(request.user)
            if booking_id:
                booking = queryset.filter(pk=booking_id).first()
                if booking is None:
                    return Response({"detail": "Not found."}, status=404)
                return Response({
                    "booking_id": str(booking.id),
                    "status": booking.status,
                    "payment_status": booking.payment_status,
                    "dispute_status": booking.dispute_status,
                    "events": _timeline_for_booking(booking),
                })
            bookings = queryset.order_by("-updated_at", "-created_at")[:100]
            return Response([
                {
                    "booking_id": str(booking.id),
                    "status": booking.status,
                    "payment_status": booking.payment_status,
                    "dispute_status": booking.dispute_status,
                    "moving_date": booking.moving_date,
                    "events": _timeline_for_booking(booking),
                }
                for booking in bookings
            ])

        queryset = moving_financial_documents_for_user(request.user)
        if object_id is not None:
            document = queryset.filter(pk=object_id).first()
            if document is None:
                return Response({"detail": "Not found."}, status=404)
            return Response(self.serialize(document))

        queryset = queryset.order_by("-created_at", "-id")
        return Response([self.serialize(document) for document in queryset])
