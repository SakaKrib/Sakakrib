from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone as dt_timezone

import jwt
from django.conf import settings
from django.db import models

from .models import Profile


class RefreshToken(models.Model):
    jti = models.UUIDField(primary_key=True)
    user = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name='refresh_tokens')
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    replaced_by = models.UUIDField(null=True, blank=True)

    class Meta:
        db_table = 'django_refresh_tokens'
        indexes = [models.Index(fields=['user', 'revoked_at']), models.Index(fields=['expires_at'])]

    @property
    def is_valid(self):
        from django.utils import timezone
        return self.revoked_at is None and self.expires_at > timezone.now()


def _now():
    return datetime.now(dt_timezone.utc)


def _encode(user: Profile, token_type: str, lifetime: int, jti: uuid.UUID | None = None):
    now = _now()
    payload = {
        'sub': str(user.pk), 'type': token_type, 'iat': now,
        'exp': now + timedelta(seconds=lifetime),
        'iss': settings.JWT_ISSUER, 'aud': settings.JWT_AUDIENCE,
    }
    if jti:
        payload['jti'] = str(jti)
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def issue_token_pair(user: Profile):
    refresh_jti = uuid.uuid4()
    expires_at = _now() + timedelta(seconds=settings.JWT_REFRESH_LIFETIME_SECONDS)
    RefreshToken.objects.create(jti=refresh_jti, user=user, expires_at=expires_at)
    return (
        _encode(user, 'access', settings.JWT_ACCESS_LIFETIME_SECONDS),
        _encode(user, 'refresh', settings.JWT_REFRESH_LIFETIME_SECONDS, refresh_jti),
    )


def rotate_refresh_token(raw_refresh: str):
    try:
        payload = jwt.decode(raw_refresh, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM], issuer=settings.JWT_ISSUER, audience=settings.JWT_AUDIENCE)
    except jwt.PyJWTError as exc:
        raise ValueError('Invalid or expired refresh token.') from exc
    if payload.get('type') != 'refresh' or not payload.get('jti') or not payload.get('sub'):
        raise ValueError('Invalid refresh token.')
    try:
        record = RefreshToken.objects.select_related('user').select_for_update().get(jti=uuid.UUID(payload['jti']))
        user = record.user
    except (ValueError, RefreshToken.DoesNotExist) as exc:
        raise ValueError('Refresh token is no longer valid.') from exc
    if str(user.pk) != str(payload['sub']) or not user.is_active or not record.is_valid:
        raise ValueError('Refresh token is no longer valid.')

    new_jti = uuid.uuid4()
    new_expiry = _now() + timedelta(seconds=settings.JWT_REFRESH_LIFETIME_SECONDS)
    RefreshToken.objects.create(jti=new_jti, user=user, expires_at=new_expiry)
    from django.utils import timezone
    record.revoked_at = timezone.now()
    record.replaced_by = new_jti
    record.save(update_fields=['revoked_at', 'replaced_by'])
    return _encode(user, 'access', settings.JWT_ACCESS_LIFETIME_SECONDS), _encode(user, 'refresh', settings.JWT_REFRESH_LIFETIME_SECONDS, new_jti)


def revoke_refresh_token(raw_refresh: str):
    try:
        payload = jwt.decode(raw_refresh, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM], issuer=settings.JWT_ISSUER, audience=settings.JWT_AUDIENCE, options={'verify_exp': False})
        jti = uuid.UUID(str(payload.get('jti')))
        RefreshToken.objects.filter(jti=jti, revoked_at__isnull=True).update(revoked_at=__import__('django.utils.timezone', fromlist=['timezone']).timezone.now())
    except (jwt.PyJWTError, ValueError, TypeError):
        pass
