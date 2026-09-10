from django.core.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .domain_property import PropertyUnit, RenterUnitAssociation
from .renter_services import create_renter_unit_request


class RenterPropertyUnitRequestView(APIView):
    """Renter -> vacant property unit rental request boundary.

    This is intentionally separate from mover Booking and rent payment APIs.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        unit_id = request.data.get("unit_id")
        if not unit_id:
            return Response({"detail": "unit_id is required."}, status=400)
        try:
            return Response(
                create_renter_unit_request(
                    renter_user_id=request.user.id,
                    unit_id=unit_id,
                ),
                status=201,
            )
        except ValidationError as exc:
            return Response({"detail": getattr(exc, "message", None) or str(exc)}, status=400)

    def get(self, request):
        rows = RenterUnitAssociation.objects.filter(
            renter_user_id=request.user.id,
            status="PENDING",
        ).order_by("-created_at")
        return Response([
            {
                "id": str(row.id),
                "unit_id": str(row.unit_id),
                "landlord_id": str(row.landlord_id),
                "renter_name": row.renter_name,
                "renter_email": row.renter_email,
                "rent_amount": row.rent_amount,
                "status": row.status,
                "created_at": row.created_at,
                "expires_at": row.invite_expires_at,
            }
            for row in rows
        ])
