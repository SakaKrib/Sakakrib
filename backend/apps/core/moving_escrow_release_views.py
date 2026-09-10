from django.core.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .moving_escrow_release import release_moving_escrow


class MovingEscrowReleaseView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, booking_id):
        try:
            return Response(
                release_moving_escrow(
                    admin_user_id=request.user.id,
                    booking_id=booking_id,
                )
            )
        except (ValidationError, TypeError, ValueError) as exc:
            return Response({"detail": str(exc)}, status=400)
