import jwt
from django.conf import settings
from rest_framework import authentication, exceptions
from rest_framework_simplejwt.tokens import AccessToken

from .models import Profile


class SupabasePrincipal:
    """Small DRF principal backed by a Supabase Auth JWT and profile row."""
    def __init__(self, user_id, claims, profile):
        self.id = user_id
        self.pk = user_id
        self.claims = claims
        self.profile = profile
        self.is_authenticated = True
        self.is_active = True
        self.role = (profile.role or '').lower()

    def __str__(self):
        return str(self.id)


class SupabaseJWTAuthentication(authentication.BaseAuthentication):
    """Validate Supabase access JWTs from Authorization or an HttpOnly cookie."""

    keyword = 'Bearer'

    def authenticate(self, request):
        raw = self._token(request)
        if not raw:
            return None
        secret = settings.SUPABASE_JWT_SECRET
        if not secret:
            raise exceptions.AuthenticationFailed('Supabase JWT verification is not configured')
        try:
            claims = jwt.decode(
                raw,
                secret,
                algorithms=['HS256'],
                audience=settings.SUPABASE_JWT_AUDIENCE,
            )
        except jwt.PyJWTError as exc:
            raise exceptions.AuthenticationFailed('Invalid or expired access token') from exc

        sub = claims.get('sub')
        if not sub:
            raise exceptions.AuthenticationFailed('Access token has no subject')
        try:
            profile = Profile.objects.get(pk=sub)
        except Profile.DoesNotExist as exc:
            raise exceptions.AuthenticationFailed('Profile not found') from exc
        return SupabasePrincipal(sub, claims, profile), raw

    @staticmethod
    def _token(request):
        header = request.headers.get('Authorization', '')
        if header.startswith('Bearer '):
            return header[7:].strip()
        return request.COOKIES.get(settings.SUPABASE_ACCESS_COOKIE)
