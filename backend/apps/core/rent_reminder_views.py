from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .rent_reminder_services import send_rent_payment_reminder


class RentPaymentReminderView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, renter_assoc_id):
        try:
            result = send_rent_payment_reminder(
                landlord_id=request.user.id,
                renter_assoc_id=renter_assoc_id,
                message=request.data.get("message"),
            )
        except PermissionError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except (TypeError, ValueError) as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            # ValidationError is intentionally handled here without exposing
            # internal database details to the API client.
            from django.core.exceptions import ValidationError
            if isinstance(exc, ValidationError):
                return Response({"detail": str(exc.message if hasattr(exc, "message") else exc)}, status=status.HTTP_400_BAD_REQUEST)
            raise

        return Response(result, status=status.HTTP_200_OK)
