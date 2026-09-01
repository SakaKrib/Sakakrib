from django.core.exceptions import ValidationError
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
        except ValidationError as exc:
            detail = exc.messages[0] if getattr(exc, "messages", None) else str(exc)
            return Response({"detail": detail}, status=status.HTTP_400_BAD_REQUEST)
        except (TypeError, ValueError) as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(result, status=status.HTTP_200_OK)
