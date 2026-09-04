from django.core.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .mover_payout_admin_services import retry_failed_mover_payout


class MoverPayoutRetryView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, payout_id):
        try:
            result = retry_failed_mover_payout(
                admin_user_id=request.user.id,
                payout_id=payout_id,
            )
            return Response(result, status=202)
        except PermissionDenied as exc:
            return Response({"detail": str(exc)}, status=403)
        except (ValidationError, TypeError, ValueError) as exc:
            return Response({"detail": str(exc)}, status=400)
