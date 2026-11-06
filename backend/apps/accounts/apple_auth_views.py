import hashlib
import json
import logging
import secrets
import urllib.parse

from django.conf import settings
from django.contrib.auth.models import update_last_login
from django.http import HttpResponseRedirect
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.email_services import queue_email

from .apple_auth import (
    APPLE_ISSUER,
    apple_configuration_is_ready,
    authenticate_apple_credential,
    exchange_apple_authorization_code,
)
from .jwt_service import issue_token_pair, set_auth_cookies
from .serializers import ProfileSerializer

logger = logging.getLogger(__name__)
APPLE_STATE_COOKIE = "sakakrib_apple_state"
APPLE_NONCE_COOKIE = "sakakrib_apple_nonce"
APPLE_CALLBACK_PATH = "/api/accounts/apple/callback/"


def _record_apple_sign_in(request, user):
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


class AppleLoginStartView(APIView):
    """Start Apple's browser authorization-code flow with state and nonce cookies."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        if not apple_configuration_is_ready():
            return Response(
                {"error": "Apple sign-in is not configured yet. Please use Google or email and password."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        state = secrets.token_urlsafe(32)
        nonce = secrets.token_urlsafe(32)
        hashed_nonce = hashlib.sha256(nonce.encode("utf-8")).hexdigest()
        query = urllib.parse.urlencode({
            "client_id": settings.APPLE_CLIENT_ID,
            "redirect_uri": settings.APPLE_REDIRECT_URI,
            "response_type": "code",
            "response_mode": "form_post",
            "scope": "name email",
            "state": state,
            "nonce": hashed_nonce,
        })
        response = HttpResponseRedirect(f"{APPLE_ISSUER}/auth/authorize?{query}")
        cookie_options = {
            "max_age": 300,
            "secure": True,
            "httponly": True,
            "samesite": "None",
            "path": APPLE_CALLBACK_PATH,
        }
        response.set_cookie(APPLE_STATE_COOKIE, state, **cookie_options)
        response.set_cookie(APPLE_NONCE_COOKIE, hashed_nonce, **cookie_options)
        response["Cache-Control"] = "no-store"
        response["Referrer-Policy"] = "no-referrer"
        return response


class AppleLoginCallbackView(APIView):
    """Handle Apple's form_post callback, exchange the code, and issue Saka Krib cookies."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        state = str(request.data.get("state") or "")
        android_state_prefix = "sakakrib_android:"
        is_android_callback = state.startswith(android_state_prefix)

        if is_android_callback:
            # The app supplies a cryptographically random nonce in state. Apple
            # echoes state to this HTTPS callback, and its signed ID token must
            # contain the same nonce before any token is returned to the app.
            nonce = state[len(android_state_prefix):]
            if len(nonce) != 64 or any(char not in "0123456789abcdef" for char in nonce.lower()):
                return Response(
                    {"error": "Apple sign-in state validation failed. Please try again."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            expected_state = request.COOKIES.get(APPLE_STATE_COOKIE, "")
            nonce = request.COOKIES.get(APPLE_NONCE_COOKIE, "")
            if not state or not expected_state or not secrets.compare_digest(state, expected_state) or not nonce:
                return Response(
                    {"error": "Apple sign-in state validation failed. Please try again."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        if request.data.get("error"):
            if is_android_callback:
                return HttpResponseRedirect(
                    f"{settings.APPLE_BUNDLE_ID}://apple-login?success=false"
                )
            return Response(
                {"error": "Apple sign-in was cancelled or could not be completed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        code = request.data.get("code")
        if not isinstance(code, str) or not code.strip():
            if is_android_callback:
                return HttpResponseRedirect(
                    f"{settings.APPLE_BUNDLE_ID}://apple-login?success=false"
                )
            return Response(
                {"error": "Apple did not return an authorization code."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        token_response = exchange_apple_authorization_code(code.strip())
        identity_token = token_response["id_token"]

        user_payload = request.data.get("user") or {}
        if isinstance(user_payload, str):
            try:
                user_payload = json.loads(user_payload)
            except ValueError:
                user_payload = {}
        if not isinstance(user_payload, dict):
            user_payload = {}
        name = user_payload.get("name") or {}
        if not isinstance(name, dict):
            name = {}
        full_name = " ".join(
            part.strip()
            for part in (name.get("firstName", ""), name.get("lastName", ""))
            if isinstance(part, str) and part.strip()
        )

        if is_android_callback:
            # Persist the first-login name before Apple stops returning it.
            authenticate_apple_credential(
                identity_token,
                expected_nonce=nonce,
                supplied_name=full_name,
            )
            app_callback = f"{settings.APPLE_BUNDLE_ID}://apple-login"
            callback_query = urllib.parse.urlencode({
                "success": "true",
                "access_token": token_response["access_token"],
                "id_token": identity_token,
            })
            response = HttpResponseRedirect(f"{app_callback}?{callback_query}")
            response["Cache-Control"] = "no-store"
            response["Referrer-Policy"] = "no-referrer"
            return response

        user = authenticate_apple_credential(
            identity_token,
            expected_nonce=nonce,
            supplied_name=full_name,
        )
        _record_apple_sign_in(request, user)

        frontend_url = settings.SAKAKRIB_PUBLIC_FRONTEND_URL or "https://sakakrib.com"
        response = HttpResponseRedirect(frontend_url)
        access, refresh = issue_token_pair(user)
        set_auth_cookies(response, access, refresh)
        response.delete_cookie(APPLE_STATE_COOKIE, path=APPLE_CALLBACK_PATH, samesite="None")
        response.delete_cookie(APPLE_NONCE_COOKIE, path=APPLE_CALLBACK_PATH, samesite="None")
        response["Cache-Control"] = "no-store"
        response["Referrer-Policy"] = "no-referrer"
        return response


class AppleLoginView(APIView):
    """Verify a native Apple identity token and issue Saka Krib's HttpOnly cookies."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        if not apple_configuration_is_ready():
            return Response(
                {"error": "Apple sign-in is not configured yet. Please use Google or email and password."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        identity_token = request.data.get("id_token") or request.data.get("identity_token")
        nonce = request.data.get("nonce")
        supplied_name = request.data.get("full_name") or ""

        if not isinstance(identity_token, str) or not identity_token:
            return Response(
                {"error": "Apple identity token is required."},
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
        _record_apple_sign_in(request, user)
        return response
