from django.core.exceptions import ValidationError
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .renter_services import (
    cancel_renter_invitation,
    claim_renter_invitation,
    create_renter_invitation,
    preview_renter_invitation,
    resend_renter_invitation,
)


def _error(exc):
    return Response({"detail": getattr(exc, "message", None) or str(exc)}, status=status.HTTP_400_BAD_REQUEST)


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
