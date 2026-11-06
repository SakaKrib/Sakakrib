from unittest.mock import patch

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .models import Profile


@override_settings(GOOGLE_CLIENT_ID="sakakrib-web-test.apps.googleusercontent.com")
class GoogleAuthenticationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.claims = {
            "iss": "https://accounts.google.com",
            "sub": "google-subject-123",
            "email": "new.user@example.com",
            "email_verified": True,
            "name": "New Google User",
        }

    def _mock_google_keys(self, mock_jwk_client):
        mock_jwk_client.return_value.get_signing_key_from_jwt.return_value.key = "test-google-public-key"

    @patch("apps.accounts.google_auth_views.queue_email")
    @patch("apps.accounts.google_auth.jwt.PyJWKClient")
    @patch("apps.accounts.google_auth.jwt.decode")
    def test_google_signup_creates_profile_and_secure_httponly_cookies(
        self, mock_decode, mock_jwk_client, mock_queue_email
    ):
        mock_decode.return_value = self.claims
        self._mock_google_keys(mock_jwk_client)

        response = self.client.post(
            "/api/accounts/google/",
            {"credential": "mock-google-id-token"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["authenticated"])
        self.assertEqual(Profile.objects.count(), 1)
        profile = Profile.objects.get(email="new.user@example.com")
        self.assertEqual(profile.google_subject, "google-subject-123")
        self.assertTrue(profile.email_verified)
        self.assertIsNone(profile.role)

        access_cookie = response.cookies["sakakrib_access"]
        refresh_cookie = response.cookies["sakakrib_refresh"]
        for cookie in (access_cookie, refresh_cookie):
            self.assertTrue(cookie["httponly"])
            self.assertTrue(cookie["secure"])
            self.assertEqual(cookie["samesite"], "None")

        mock_decode.assert_called_once_with(
            "mock-google-id-token",
            "test-google-public-key",
            algorithms=["RS256"],
            audience="sakakrib-web-test.apps.googleusercontent.com",
        )
        mock_queue_email.assert_called_once()

    @patch("apps.accounts.google_auth_views.queue_email")
    @patch("apps.accounts.google_auth.jwt.PyJWKClient")
    @patch("apps.accounts.google_auth.jwt.decode")
    def test_google_login_reuses_existing_profile(self, mock_decode, mock_jwk_client, _mock_queue_email):
        existing = Profile.objects.create_user(
            email="new.user@example.com",
            password="Existing-password-123!",
            full_name="Existing Profile",
            email_verified=False,
        )
        mock_decode.return_value = self.claims
        self._mock_google_keys(mock_jwk_client)

        response = self.client.post(
            "/api/accounts/google/",
            {"credential": "mock-google-id-token"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(Profile.objects.count(), 1)
        existing.refresh_from_db()
        self.assertEqual(existing.google_subject, "google-subject-123")
        self.assertTrue(existing.email_verified)

    @patch("apps.accounts.google_auth.jwt.PyJWKClient")
    @patch("apps.accounts.google_auth.jwt.decode")
    def test_google_login_rejects_unverified_email(self, mock_decode, mock_jwk_client):
        claims = {**self.claims, "email_verified": False}
        mock_decode.return_value = claims
        self._mock_google_keys(mock_jwk_client)

        response = self.client.post(
            "/api/accounts/google/",
            {"credential": "mock-google-id-token"},
            format="json",
        )

        self.assertEqual(response.status_code, 401)
        self.assertEqual(Profile.objects.count(), 0)
