from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone as dt_timezone

import jwt
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from .models import Profile, RefreshToken


LEGACY_REFRESH_COOKIE = 'refreshToken'
REFRESH_REUSE_GRACE_SECONDS = 120


def _now():
    return datetime.now(dt_timezone.utc)


def _encode(user: Profile, token_type: str, lifetime: int, jti: uuid.UUID | None = None):
    now = _now()
    payload = {'sub': str(user.pk), 'type': token_type, 'iat': now, 'exp': now + timedelta(seconds=lifetime), 'iss': settings.JWT_ISSUER, 'aud': settings.JWT_AUDIENCE}
    if jti:
        payload['jti'] = str(jti)
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def issue_token_pair(user: Profile):
    refresh_jti = uuid.uuid4()
    RefreshToken.objects.create(jti=refresh_jti, user=user, expires_at=_now() + timedelta(seconds=settings.JWT_REFRESH_LIFETIME_SECONDS))
    return _encode(user, 'access', settings.JWT_ACCESS_LIFETIME_SECONDS), _encode(user, 'refresh', settings.JWT_REFRESH_LIFETIME_SECONDS, refresh_jti)


@transaction.atomic
def rotate_refresh_token(raw_refresh: str):
    try:
        payload = jwt.decode(raw_refresh, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM], issuer=settings.JWT_ISSUER, audience=settings.JWT_AUDIENCE)
        jti = uuid.UUID(str(payload.get('jti')))
        user_id = uuid.UUID(str(payload.get('sub')))
    except (jwt.PyJWTError, ValueError, TypeError) as exc:
        raise ValueError('Invalid or expired refresh token.') from exc
    if payload.get('type') != 'refresh':
        raise ValueError('Invalid refresh token.')
    try:
        record = RefreshToken.objects.select_for_update().select_related('user').get(pk=jti)
    except RefreshToken.DoesNotExist as exc:
        raise ValueError('Refresh token is no longer valid.') from exc
    user = record.user
    if user.pk != user_id or not user.is_active or record.expires_at <= timezone.now():
        raise ValueError('Refresh token is no longer valid.')
    if record.revoked_at is not None:
        # Rotation race: two requests (page reload + an API call, two tabs, or the
        # app waking up) can present the same refresh cookie at once. The second one
        # arrives just after the first rotated it. Within a short grace window, hand
        # back the already-issued replacement instead of treating it as token theft
        # and logging the person out.
        replacement = RefreshToken.objects.filter(pk=record.replaced_by).first() if record.replaced_by else None
        within_grace = record.revoked_at >= timezone.now() - timedelta(seconds=REFRESH_REUSE_GRACE_SECONDS)
        if replacement is None or not within_grace or replacement.revoked_at is not None or replacement.expires_at <= timezone.now():
            raise ValueError('Refresh token is no longer valid.')
        return (
            _encode(user, 'access', settings.JWT_ACCESS_LIFETIME_SECONDS),
            _encode(user, 'refresh', settings.JWT_REFRESH_LIFETIME_SECONDS, replacement.jti),
        )
    new_jti = uuid.uuid4()
    RefreshToken.objects.create(jti=new_jti, user=user, expires_at=_now() + timedelta(seconds=settings.JWT_REFRESH_LIFETIME_SECONDS))
    record.revoked_at = timezone.now()
    record.replaced_by = new_jti
    record.save(update_fields=['revoked_at', 'replaced_by'])
    return _encode(user, 'access', settings.JWT_ACCESS_LIFETIME_SECONDS), _encode(user, 'refresh', settings.JWT_REFRESH_LIFETIME_SECONDS, new_jti)


def revoke_refresh_token(raw_refresh: str):
    try:
        payload = jwt.decode(raw_refresh, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM], issuer=settings.JWT_ISSUER, audience=settings.JWT_AUDIENCE, options={'verify_exp': False})
        jti = uuid.UUID(str(payload.get('jti')))
        RefreshToken.objects.filter(pk=jti, revoked_at__isnull=True).update(revoked_at=timezone.now())
    except (jwt.PyJWTError, ValueError, TypeError):
        pass


def _clear_legacy_refresh_cookie(response):
    response.delete_cookie(LEGACY_REFRESH_COOKIE, path='/')


def set_auth_cookies(response, access_token: str, refresh_token: str):
    # Authentication cookies belong to the API host (for example, the
    # configured Tailscale hostname). Omitting Domain makes them host-only.
    # SameSite=None is required for credentialed requests from the Capacitor
    # WebView origin, and browsers require Secure whenever it is used.
    common = {'httponly': True, 'secure': True, 'samesite': 'None', 'path': '/'}
    response.set_cookie(settings.JWT_ACCESS_COOKIE, access_token, max_age=settings.JWT_ACCESS_LIFETIME_SECONDS, **common)
    response.set_cookie(settings.JWT_REFRESH_COOKIE, refresh_token, max_age=settings.JWT_REFRESH_LIFETIME_SECONDS, **common)
    _clear_legacy_refresh_cookie(response)


def clear_auth_cookies(response):
    # Clear host-only cookies and cookies issued by the former configured
    # Domain attribute so stale credentials cannot shadow the new cookies.
    for cookie_name in (settings.JWT_ACCESS_COOKIE, settings.JWT_REFRESH_COOKIE):
        response.delete_cookie(cookie_name, path='/', samesite='None')
        legacy_domain = getattr(settings, 'LEGACY_JWT_COOKIE_DOMAIN', None)
        if legacy_domain:
            response.delete_cookie(cookie_name, path='/', domain=legacy_domain, samesite='None')
    _clear_legacy_refresh_cookie(response)
