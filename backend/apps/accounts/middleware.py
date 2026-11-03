from django.conf import settings


class CapacitorCookiePolicyMiddleware:
    """Apply cross-site cookie attributes only to known API client origins.

    Capacitor's Android WebView and the network browser frontend call the API
    on a different origin. Their JWT and CSRF cookies therefore need Secure
    and SameSite=None. Local browser development keeps the default policy.
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
        if (
            request.path.startswith("/api/")
            and request.headers.get("Origin") in self.cross_site_origins
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
        return response
