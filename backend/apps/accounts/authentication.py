from __future__ import annotations

import uuid

import jwt
from django.conf import settings
from django.contrib.auth import get_user_model
from rest_framework import authentication, exceptions


class CookieJWTAuthentication(authentication.BaseAuthentication):
    """Authenticate DRF requests from the Django access JWT HttpOnly cookie."""

    def authenticate(self, request):
        token = request.COOKIES.get(settings.JWT_ACCESS_COOKIE)
        if not token:
            return None
        try:
            claims = jwt.decode(
                token,
                settings.JWT_SECRET_KEY,
                algorithms=[settings.JWT_ALGORITHM],
                issuer=settings.JWT_ISSUER,
                audience=settings.JWT_AUDIENCE,
            )
        except jwt.PyJWTError as exc:
            raise exceptions.AuthenticationFailed('Invalid or expired access token') from exc

        if claims.get('type') != 'access' or not claims.get('sub'):
            raise exceptions.AuthenticationFailed('Invalid access token')
        try:
            user_id = uuid.UUID(str(claims['sub']))
            user = get_user_model().objects.get(pk=user_id, is_active=True)
        except (ValueError, TypeError, get_user_model().DoesNotExist) as exc:
            raise exceptions.AuthenticationFailed('Authentication account not found') from exc
        return user, claims

    def authenticate_header(self, request):
        return 'Bearer'


class CookieJWTAuthenticationBackend:
    """Django backend retained for settings compatibility; JWT is verified by DRF."""

    def authenticate(self, request, **credentials):
        return None

    def get_user(self, user_id):
        try:
            return get_user_model().objects.get(pk=user_id, is_active=True)
        except get_user_model().DoesNotExist:
            return None
