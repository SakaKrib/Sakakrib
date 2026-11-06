import logging

from django.conf import settings
from django.contrib.auth.models import update_last_login
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.email_services import queue_email

from .apple_auth import (
    apple_configuration_is_ready,
    authenticate_apple_credential,
    exchange_apple_authorization_code,
)
from .jwt_service import issue_token_pair, set_auth_cookies
from .serializers import ProfileSerializer

logger = logging.getLogger(__name__)


class AppleAuthConfigView(APIView):
    """Expose only the public Apple client settings needed by the login UI."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        enabled = apple_configuration_is_ready()
        return Response({
            "enabled": enabled,
            "clientId": settings.APPLE_CLIENT_ID if enabled else "",
            "redirectUrl": settings.APPLE_REDIRECT_URI if enabled else "",
            "bundleId": settings.APPLE_BUNDLE_ID,
        })


class AppleLoginView(APIView):
    """Verify an Apple identity token and issue Saka Krib's existing HttpOnly cookies."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        if not apple_configuration_is_ready():
            return Response(
                {"error": "Apple sign-in is not configured yet. Please use Google or email and password."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        identity_token = request.data.get("id_token") or request.data.get("identity_token")
        authorization_code = request.data.get("code") or request.data.get("authorization_code")
        nonce = request.data.get("nonce")
        supplied_name = request.data.get("full_name") or ""

        if identity_token and not isinstance(identity_token, str):
            return Response({"error": "Apple identity token is invalid."}, status=status.HTTP_400_BAD_REQUEST)
        if authorization_code:
            if not isinstance(authorization_code, str):
                return Response({"error": "Apple authorization code is invalid."}, status=status.HTTP_400_BAD_REQUEST)
            identity_token = exchange_apple_authorization_code(authorization_code.strip())

        if not identity_token:
            return Response(
                {"error": "Apple identity token or authorization code is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = authenticate_apple_credential(
            identity_token.strip(),
            expected_nonce=nonce.strip() if isinstance(nonce, str) and nonce.strip() else None,
            supplied_name=supplied_name if isinstance(supplied_name, str) else "",
        )
        access, refresh = issue_token_pair(user)
        response = Response(
            {
                "success": True,
                "authenticated": True,
                "user": {"id": str(user.id), "email": user.email},
                "profile": ProfileSerializer(user).data,
            },
            status=status.HTTP_200_OK,
        )
        set_auth_cookies(response, access, refresh)
        update_last_login(None, user)

        try:
            queue_email(
                recipient=user.email,
                template_type="sign_in_notification",
                payload={
                    "email": user.email,
                    "full_name": user.full_name,
                    "sign_in_time": timezone.localtime().strftime("%d %b %Y, %H:%M %Z"),
                    "device": request.META.get("HTTP_USER_AGENT", "Unknown device")[:255],
                    "location": request.META.get("REMOTE_ADDR", "Unknown location"),
                    "security_url": "https://sakakrib.com",
                },
            )
        except Exception:
            logger.exception("Failed to queue Apple sign-in notification for %s", user.email)

        return response
