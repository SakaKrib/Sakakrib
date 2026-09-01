import uuid

import jwt
from channels.db import database_sync_to_async
from django.conf import settings
from django.contrib.auth import get_user_model


@database_sync_to_async
def _user_from_token(token):
    try:
        claims = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
            issuer=settings.JWT_ISSUER,
            audience=settings.JWT_AUDIENCE,
        )
        if claims.get("type") != "access" or not claims.get("sub"):
            return None
        user_id = uuid.UUID(str(claims["sub"]))
        return get_user_model().objects.filter(pk=user_id, is_active=True).first()
    except (jwt.PyJWTError, ValueError, TypeError):
        return None


class CookieJWTWebSocketMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        headers = dict(scope.get("headers", []))
        raw_cookie = headers.get(b"cookie", b"").decode("latin1")
        cookies = {}
        for part in raw_cookie.split(";"):
            if "=" in part:
                key, value = part.strip().split("=", 1)
                cookies[key] = value
        token = cookies.get(settings.JWT_ACCESS_COOKIE)
        scope["user"] = await _user_from_token(token) if token else None
        return await self.app(scope, receive, send)
