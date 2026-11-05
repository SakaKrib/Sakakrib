from django.conf import settings
from django.utils.cache import patch_vary_headers


class CapacitorCookiePolicyMiddleware:
    """Apply the explicit CORS and cookie policy for trusted API clients.

    Capacitor's Android WebView calls the API from https://localhost. Because
    JWT authentication uses HttpOnly cookies, credentialed CORS responses must
    echo that exact allowlisted origin; a wildcard origin is invalid.
    """

    cross_site_origins = {
        "https://localhost",
        "capacitor://localhost",
        "http://100.109.224.0:5175",
    }

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        origin = request.headers.get("Origin")

        # Only reflect origins explicitly trusted by Django's CORS allowlist.
        # This middleware is placed before CorsMiddleware so it runs last on
        # the response and prevents a proxy/default wildcard from breaking
        # credentialed Capacitor requests.
        if request.path.startswith("/api/") and origin in settings.CORS_ALLOWED_ORIGINS:
            response["Access-Control-Allow-Origin"] = origin
            response["Access-Control-Allow-Credentials"] = "true"
            patch_vary_headers(response, ("Origin",))

        if (
            request.path.startswith("/api/")
            and origin in self.cross_site_origins
        ):
            cookie_names = {
                settings.CSRF_COOKIE_NAME,
                settings.JWT_ACCESS_COOKIE,
                settings.JWT_REFRESH_COOKIE,
            }
            for name in cookie_names:
                cookie = response.cookies.get(name)
                if cookie is not None:
                    cookie["secure"] = True
                    cookie["samesite"] = "None"
                    if name in {settings.JWT_ACCESS_COOKIE, settings.JWT_REFRESH_COOKIE}:
                        cookie["httponly"] = True
                    # Do not set Domain: cookies remain scoped to the API host.

        return response
