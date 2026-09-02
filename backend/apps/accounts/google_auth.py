from __future__ import annotations

from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from django.conf import settings
from django.db import transaction
from rest_framework import exceptions

from .models import Profile


def verify_google_credential(credential: str) -> dict:
    if not credential or not settings.GOOGLE_CLIENT_ID:
        raise exceptions.AuthenticationFailed('Google authentication is not configured.')
    try:
        claims = id_token.verify_oauth2_token(
            credential,
            google_requests.Request(),
            settings.GOOGLE_CLIENT_ID,
        )
    except Exception as exc:
        raise exceptions.AuthenticationFailed('Invalid Google credential.') from exc

    issuer = claims.get('iss')
    if issuer not in ('accounts.google.com', 'https://accounts.google.com'):
        raise exceptions.AuthenticationFailed('Invalid Google token issuer.')
    if not claims.get('sub'):
        raise exceptions.AuthenticationFailed('Google account identifier is missing.')
    email = str(claims.get('email') or '').strip().lower()
    if not email or claims.get('email_verified') is not True:
        raise exceptions.AuthenticationFailed('Google email verification is required.')
    return claims


@transaction.atomic
def authenticate_google_credential(credential: str) -> Profile:
    claims = verify_google_credential(credential)
    google_subject = str(claims['sub'])
    email = str(claims['email']).strip().lower()
    full_name = str(claims.get('name') or '').strip()

    user = Profile.objects.select_for_update().filter(google_subject=google_subject).first()
    if user is None:
        user = Profile.objects.select_for_update().filter(email__iexact=email).first()

    if user is None:
        user = Profile.objects.create_user(
            email=email,
            password=None,
            full_name=full_name,
            email_verified=True,
            verification_status='verified',
            kyc_status='pending',
            google_subject=google_subject,
        )
    else:
        if user.google_subject and user.google_subject != google_subject:
            raise exceptions.AuthenticationFailed('This email is already linked to another Google account.')
        updates = []
        if user.google_subject != google_subject:
            user.google_subject = google_subject
            updates.append('google_subject')
        if not user.email_verified:
            user.email_verified = True
            updates.append('email_verified')
        if full_name and not user.full_name:
            user.full_name = full_name
            updates.append('full_name')
        if updates:
            user.save(update_fields=[*updates, 'updated_at'])

    if not user.is_active:
        raise exceptions.AuthenticationFailed('This account is inactive.')
    return user
