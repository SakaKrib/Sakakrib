from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .models import Profile


@override_settings(
    APPLE_CLIENT_ID="com.sakakrib.web",
    APPLE_BUNDLE_ID="com.sakakrib.app",
    APPLE_TEAM_ID="TEAM123",
    APPLE_KEY_ID="KEY123",
    APPLE_PRIVATE_KEY_PATH="/tmp/apple-auth-test-key.p8",
    APPLE_REDIRECT_URI="https://sakakrib.com/api/accounts/apple/callback/",
)
class AppleAuthenticationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.claims = {
            "iss": "https://appleid.apple.com",
            "sub": "apple-subject-123",
            "aud": "com.sakakrib.app",
            "email": "new.apple@example.com",
            "email_verified": "true",
            "nonce": "test-nonce",
        }

    @patch("apps.accounts.apple_auth.Path.is_file", return_value=True)
    @patch("apps.accounts.apple_auth.jwt.PyJWKClient")
    @patch("apps.accounts.apple_auth.jwt.decode")
    @patch("apps.accounts.apple_auth_views.queue_email")
    def test_apple_signup_issues_secure_httponly_cookies(
        self, _queue_email, mock_decode, mock_jwk_client, _key_exists
    ):
        mock_decode.return_value = self.claims
        mock_jwk_client.return_value.get_signing_key_from_jwt.return_value.key = "apple-public-key"

        response = self.client.post(
            "/api/accounts/apple/",
            {"id_token": "mock-apple-id-token", "nonce": "test-nonce", "full_name": "Apple User"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["authenticated"])
        user = Profile.objects.get(email="new.apple@example.com")
        self.assertEqual(user.apple_subject, "apple-subject-123")
        self.assertTrue(user.email_verified)
        for name in ("sakakrib_access", "sakakrib_refresh"):
            cookie = response.cookies[name]
            self.assertTrue(cookie["httponly"])
            self.assertTrue(cookie["secure"])
            self.assertEqual(cookie["samesite"], "None")

    @patch("apps.accounts.apple_auth.Path.is_file", return_value=True)
    @patch("apps.accounts.apple_auth.jwt.PyJWKClient")
    @patch("apps.accounts.apple_auth.jwt.decode")
    @patch("apps.accounts.apple_auth_views.queue_email")
    def test_apple_login_links_verified_existing_email(
        self, _queue_email, mock_decode, mock_jwk_client, _key_exists
    ):
        existing = Profile.objects.create_user(
            email="new.apple@example.com",
            password="Existing-password-123!",
            email_verified=False,
        )
        mock_decode.return_value = self.claims
        mock_jwk_client.return_value.get_signing_key_from_jwt.return_value.key = "apple-public-key"

        response = self.client.post(
            "/api/accounts/apple/",
            {"id_token": "mock-apple-id-token", "nonce": "test-nonce"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        existing.refresh_from_db()
        self.assertEqual(existing.apple_subject, "apple-subject-123")
        self.assertTrue(existing.email_verified)
        self.assertEqual(Profile.objects.count(), 1)

    @patch("apps.accounts.apple_auth.Path.is_file", return_value=True)
    def test_apple_web_start_sets_secure_state_and_nonce_cookies(self, _key_exists):
        response = self.client.get("/api/accounts/apple/start/")

        self.assertEqual(response.status_code, 302)
        self.assertTrue(response["Location"].startswith("https://appleid.apple.com/auth/authorize?"))
        query = parse_qs(urlsplit(response["Location"]).query)
        self.assertEqual(query["state"][0], response.cookies["sakakrib_apple_state"].value)
        self.assertEqual(query["nonce"][0], response.cookies["sakakrib_apple_nonce"].value)
        for cookie_name in ("sakakrib_apple_state", "sakakrib_apple_nonce"):
            cookie = response.cookies[cookie_name]
            self.assertTrue(cookie["httponly"])
            self.assertTrue(cookie["secure"])
            self.assertEqual(cookie["samesite"], "None")
            self.assertEqual(cookie["path"], "/api/accounts/apple/callback/")

    def test_apple_web_callback_rejects_state_mismatch(self):
        self.client.cookies["sakakrib_apple_state"] = "expected-state"
        self.client.cookies["sakakrib_apple_nonce"] = "expected-nonce"

        response = self.client.post(
            "/api/accounts/apple/callback/",
            {"state": "attacker-state", "code": "authorization-code"},
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("state validation failed", response.data["error"].lower())

    @patch("apps.accounts.apple_auth.Path.is_file", return_value=True)
    @patch("apps.accounts.apple_auth_views.authenticate_apple_credential")
    @patch(
        "apps.accounts.apple_auth_views.exchange_apple_authorization_code",
        return_value={
            "id_token": "mock-apple-id-token",
            "access_token": "mock-apple-access-token",
        },
    )
    def test_android_callback_validates_nonce_and_redirects_only_short_lived_tokens(
        self, _exchange, mock_authenticate, _key_exists
    ):
        nonce = "a" * 64
        response = self.client.post(
            "/api/accounts/apple/callback/",
            {
                "state": f"sakakrib_android:{nonce}",
                "code": "one-time-authorization-code",
                "user": '{"name":{"firstName":"Apple","lastName":"User"}}',
            },
            format="json",
        )

        self.assertEqual(response.status_code, 302)
        callback = urlsplit(response["Location"])
        self.assertEqual(callback.scheme, "com.sakakrib.app")
        self.assertEqual(callback.netloc, "apple-login")
        query = parse_qs(callback.query)
        self.assertEqual(query["success"], ["true"])
        self.assertEqual(query["access_token"], ["mock-apple-access-token"])
        self.assertEqual(query["id_token"], ["mock-apple-id-token"])
        self.assertNotIn("refresh_token", query)
        mock_authenticate.assert_called_once_with(
            "mock-apple-id-token",
            expected_nonce=nonce,
            supplied_name="Apple User",
        )

    def test_android_callback_rejects_malformed_nonce_state(self):
        response = self.client.post(
            "/api/accounts/apple/callback/",
            {
                "state": "sakakrib_android:not-a-valid-nonce",
                "code": "one-time-authorization-code",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("state validation failed", response.data["error"].lower())

    @patch("apps.accounts.apple_auth.Path.is_file", return_value=True)
    def test_apple_config_exposes_only_public_settings(self, _key_exists):
        response = self.client.get("/api/accounts/apple/config/")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["enabled"])
        self.assertEqual(response.data["clientId"], "com.sakakrib.web")
        self.assertNotIn("TEAM123", str(response.data))
        self.assertNotIn("KEY123", str(response.data))
