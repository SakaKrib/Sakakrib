from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone as dt_timezone

import jwt
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from .models import Profile, RefreshToken


LEGACY_REFRESH_COOKIE = 'refreshToken'


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
    if user.pk != user_id or not user.is_active or record.revoked_at is not None or record.expires_at <= timezone.now():
        raise ValueError('Refresh token is no longer valid.')
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
    common = {'httponly': True, 'secure': settings.JWT_COOKIE_SECURE, 'samesite': settings.JWT_COOKIE_SAMESITE, 'domain': settings.JWT_COOKIE_DOMAIN, 'path': '/'}
    response.set_cookie(settings.JWT_ACCESS_COOKIE, access_token, max_age=settings.JWT_ACCESS_LIFETIME_SECONDS, **common)
    response.set_cookie(settings.JWT_REFRESH_COOKIE, refresh_token, max_age=settings.JWT_REFRESH_LIFETIME_SECONDS, **common)
    _clear_legacy_refresh_cookie(response)


def clear_auth_cookies(response):
    response.delete_cookie(settings.JWT_ACCESS_COOKIE, path='/', domain=settings.JWT_COOKIE_DOMAIN, samesite=settings.JWT_COOKIE_SAMESITE)
    response.delete_cookie(settings.JWT_REFRESH_COOKIE, path='/', domain=settings.JWT_COOKIE_DOMAIN, samesite=settings.JWT_COOKIE_SAMESITE)
    _clear_legacy_refresh_cookie(response)
