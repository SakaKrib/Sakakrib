from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .access_scopes import moving_financial_documents_for_user
from .domain_financial import MovingFinancialDocument


FINANCIAL_DOCUMENT_FIELDS = (
    "id", "booking_id", "payment_id", "document_type", "document_number",
    "renter_id", "mover_id", "amount_kes", "platform_fee_kes", "mover_net_kes",
    "currency", "status", "payment_provider", "provider_reference",
    "provider_transaction_id", "mover_name_snapshot", "mover_phone_snapshot",
    "vehicle_type_snapshot", "number_plate_snapshot", "mover_profile_photo_snapshot",
    "issued_at", "paid_at", "released_at", "created_at", "updated_at",
)


class MovingFinancialDocumentView(APIView):
    """Read-only financial records scoped to renter, mover owner, or admin."""

    permission_classes = [IsAuthenticated]

    def serialize(self, document):
        return {field: getattr(document, field) for field in FINANCIAL_DOCUMENT_FIELDS}

    def get(self, request, object_id=None):
        queryset = moving_financial_documents_for_user(request.user)
        if object_id is not None:
            document = queryset.filter(pk=object_id).first()
            if document is None:
                return Response({"detail": "Not found."}, status=404)
            return Response(self.serialize(document))

        queryset = queryset.order_by("-created_at", "-id")
        return Response([self.serialize(document) for document in queryset])
