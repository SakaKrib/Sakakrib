from django.conf import settings


class CapacitorCookiePolicyMiddleware:
    """Allow credentialed cross-origin API cookies from Capacitor's HTTPS WebView.

    The regular browser development origin keeps the existing cookie policy.
    Capacitor's bundled Android WebView uses https://localhost and calls the
    API on the Tailscale HTTPS hostname, so those cookies must be Secure and
    SameSite=None. This is scoped to that exact app origin and API responses.
    """

    capacitor_origin = "https://localhost"

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if (
            request.path.startswith("/api/")
            and request.headers.get("Origin") == self.capacitor_origin
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
