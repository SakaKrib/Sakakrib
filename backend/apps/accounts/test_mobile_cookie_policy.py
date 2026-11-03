from django.conf import settings
from django.http import HttpResponse
from django.test import RequestFactory, SimpleTestCase

from apps.accounts.middleware import CapacitorCookiePolicyMiddleware


class CapacitorCookiePolicyMiddlewareTests(SimpleTestCase):
    def _response_for(self, origin):
        response = HttpResponse("ok")
        response.set_cookie(settings.CSRF_COOKIE_NAME, "csrf-value", secure=False, samesite="Lax")
        response.set_cookie(
            settings.JWT_ACCESS_COOKIE,
            "access-value",
            secure=False,
            httponly=True,
            samesite="Lax",
        )
        middleware = CapacitorCookiePolicyMiddleware(lambda request: response)
        request = RequestFactory().get(
            "/api/accounts/csrf/",
            HTTP_ORIGIN=origin,
        )
        return middleware(request)

    def test_capacitor_origin_gets_secure_cross_site_cookies(self):
        response = self._response_for("https://localhost")

        self.assertTrue(response.cookies[settings.CSRF_COOKIE_NAME]["secure"])
        self.assertEqual(response.cookies["csrftoken"]["samesite"], "None")
        self.assertTrue(response.cookies[settings.JWT_ACCESS_COOKIE]["secure"])
        self.assertEqual(response.cookies["sakakrib_access"]["samesite"], "None")
        self.assertTrue(response.cookies["sakakrib_access"]["httponly"])

    def test_ios_capacitor_origin_gets_secure_cross_site_cookies(self):
        response = self._response_for("capacitor://localhost")

        self.assertTrue(response.cookies[settings.CSRF_COOKIE_NAME]["secure"])
        self.assertEqual(response.cookies["csrftoken"]["samesite"], "None")
        self.assertTrue(response.cookies[settings.JWT_ACCESS_COOKIE]["secure"])
        self.assertEqual(response.cookies["sakakrib_access"]["samesite"], "None")
        self.assertTrue(response.cookies["sakakrib_access"]["httponly"])

    def test_regular_browser_origin_keeps_existing_cookie_policy(self):
        response = self._response_for("http://100.109.224.0:5175")

        self.assertFalse(response.cookies["csrftoken"]["secure"])
        self.assertEqual(response.cookies["csrftoken"]["samesite"], "Lax")
        self.assertFalse(response.cookies["sakakrib_access"]["secure"])
        self.assertEqual(response.cookies["sakakrib_access"]["samesite"], "Lax")
