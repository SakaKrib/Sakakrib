from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import jwt
from django.conf import settings
from django.db import transaction
from rest_framework import exceptions

from .models import Profile

APPLE_ISSUER = "https://appleid.apple.com"
APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys"
APPLE_TOKEN_URL = "https://appleid.apple.com/auth/token"


def apple_configuration_is_ready() -> bool:
    key_path = str(getattr(settings, "APPLE_PRIVATE_KEY_PATH", "") or "").strip()
    required = (
        getattr(settings, "APPLE_CLIENT_ID", ""),
        getattr(settings, "APPLE_TEAM_ID", ""),
        getattr(settings, "APPLE_KEY_ID", ""),
        getattr(settings, "APPLE_REDIRECT_URI", ""),
        key_path,
    )
    return all(str(value).strip() for value in required) and Path(key_path).is_file()


def _create_apple_client_secret() -> str:
    if not apple_configuration_is_ready():
        raise exceptions.AuthenticationFailed("Apple sign-in is not fully configured on the server.")

    try:
        private_key = Path(settings.APPLE_PRIVATE_KEY_PATH).read_text(encoding="utf-8")
        now = __import__("time").time()
        return jwt.encode(
            {
                "iss": settings.APPLE_TEAM_ID,
                "iat": int(now),
                "exp": int(now) + 300,
                "aud": APPLE_ISSUER,
                "sub": settings.APPLE_CLIENT_ID,
            },
            private_key,
            algorithm="ES256",
            headers={"kid": settings.APPLE_KEY_ID},
        )
    except (OSError, ValueError, jwt.PyJWTError) as exc:
        raise exceptions.AuthenticationFailed("Apple sign-in credentials could not be loaded.") from exc


def exchange_apple_authorization_code(code: str) -> str:
    if not apple_configuration_is_ready():
        raise exceptions.AuthenticationFailed("Apple sign-in is not fully configured on the server.")
    if not code or len(code) > 4096:
        raise exceptions.AuthenticationFailed("Apple authorization code is missing or invalid.")

    payload = urllib.parse.urlencode({
        "client_id": settings.APPLE_CLIENT_ID,
        "client_secret": _create_apple_client_secret(),
        "code": code,
        "grant_type": "authorization_code",
        "redirect_uri": settings.APPLE_REDIRECT_URI,
    }).encode("utf-8")
    request = urllib.request.Request(
        APPLE_TOKEN_URL,
        data=payload,
        headers={"Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=12) as response:
            token_response = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, ValueError, OSError) as exc:
        raise exceptions.AuthenticationFailed("Apple could not validate the sign-in request. Please try again.") from exc

    identity_token = token_response.get("id_token")
    if not isinstance(identity_token, str) or not identity_token:
        raise exceptions.AuthenticationFailed("Apple did not return a valid identity token.")
    return identity_token


def verify_apple_identity_token(identity_token: str, expected_nonce: str | None = None) -> dict:
    if not identity_token or len(identity_token) > 16384:
        raise exceptions.AuthenticationFailed("Apple identity token is missing or invalid.")

    audiences = [
        value for value in (
            getattr(settings, "APPLE_CLIENT_ID", ""),
            getattr(settings, "APPLE_BUNDLE_ID", ""),
        ) if value
    ]
    if not audiences:
        raise exceptions.AuthenticationFailed("Apple sign-in is not configured.")

    try:
        signing_key = jwt.PyJWKClient(APPLE_JWKS_URL).get_signing_key_from_jwt(identity_token)
        claims = jwt.decode(
            identity_token,
            signing_key.key,
            algorithms=["RS256"],
            audience=audiences,
            issuer=APPLE_ISSUER,
            options={"require": ["iss", "aud", "exp", "sub"]},
        )
    except jwt.PyJWTError as exc:
        raise exceptions.AuthenticationFailed("Apple identity token could not be verified.") from exc

    if expected_nonce and claims.get("nonce") != expected_nonce:
        raise exceptions.AuthenticationFailed("Apple sign-in nonce validation failed.")

    if not claims.get("sub"):
        raise exceptions.AuthenticationFailed("Apple account identifier is missing.")
    return claims


def _apple_email_is_verified(value) -> bool:
    return value is True or (isinstance(value, str) and value.strip().lower() == "true")


@transaction.atomic
def authenticate_apple_credential(
    identity_token: str,
    expected_nonce: str | None = None,
    supplied_name: str = "",
) -> Profile:
    claims = verify_apple_identity_token(identity_token, expected_nonce)
    apple_subject = str(claims["sub"])
    email = str(claims.get("email") or "").strip().lower()
    email_verified = _apple_email_is_verified(claims.get("email_verified"))
    full_name = str(supplied_name or "").strip()[:255]

    user = Profile.objects.select_for_update().filter(apple_subject=apple_subject).first()
    if user is None:
        # Apple only returns the user's name on the first authorization. A
        # verified email can safely link an existing Saka Krib account; never
        # link on an unverified or client-supplied email address.
        if not email or not email_verified:
            raise exceptions.AuthenticationFailed(
                "Apple did not provide a verified email for this account. Sign in with your existing method first."
            )
        user = Profile.objects.select_for_update().filter(email__iexact=email).first()

    if user is None:
        user = Profile.objects.create_user(
            email=email,
            password=None,
            full_name=full_name,
            email_verified=True,
            verification_status="verified",
            kyc_status="pending",
            apple_subject=apple_subject,
        )
    else:
        if user.apple_subject and user.apple_subject != apple_subject:
            raise exceptions.AuthenticationFailed("This email is already linked to another Apple account.")
        updates = []
        if user.apple_subject != apple_subject:
            user.apple_subject = apple_subject
            updates.append("apple_subject")
        if email_verified and not user.email_verified:
            user.email_verified = True
            updates.append("email_verified")
        if full_name and not user.full_name:
            user.full_name = full_name
            updates.append("full_name")
        if updates:
            user.save(update_fields=[*updates, "updated_at"])

    if not user.is_active:
        raise exceptions.AuthenticationFailed("This account is inactive.")
    return user
