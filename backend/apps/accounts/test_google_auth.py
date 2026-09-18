from unittest.mock import patch

from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from .models import Profile, RefreshToken


@override_settings(GOOGLE_CLIENT_ID='test-google-client.apps.googleusercontent.com')
class GoogleAuthenticationTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    @patch('apps.accounts.google_auth.jwt.PyJWKClient')
    @patch('apps.accounts.google_auth.jwt.decode')
    def test_google_login_verifies_claims_and_issues_http_only_jwt_cookies(self, mock_decode, mock_jwk_client):
        mock_decode.return_value = {
            'iss': 'https://accounts.google.com',
            'aud': 'test-google-client.apps.googleusercontent.com',
            'sub': 'google-sub-123',
            'email': 'google@example.com',
            'email_verified': True,
            'name': 'Google User',
        }
        mock_jwk_client.return_value.get_signing_key_from_jwt.return_value.key = 'test-public-key'

        response = self.client.post(reverse('google-login'), {'credential': 'fake-google-id-token'}, format='json')

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['authenticated'])
        self.assertTrue(response.cookies['sakakrib_access']['httponly'])
        self.assertTrue(response.cookies['sakakrib_refresh']['httponly'])
        user = Profile.objects.get(email='google@example.com')
        self.assertEqual(user.google_subject, 'google-sub-123')
        self.assertTrue(user.email_verified)
        self.assertEqual(RefreshToken.objects.filter(user=user, revoked_at__isnull=True).count(), 1)

    @patch('apps.accounts.google_auth.jwt.PyJWKClient')
    @patch('apps.accounts.google_auth.jwt.decode')
    def test_google_identity_is_bound_to_subject(self, mock_decode, mock_jwk_client):
        Profile.objects.create_user(
            email='google@example.com',
            password=None,
            email_verified=True,
            google_subject='different-sub',
        )
        mock_decode.return_value = {
            'iss': 'https://accounts.google.com',
            'aud': 'test-google-client.apps.googleusercontent.com',
            'sub': 'google-sub-123',
            'email': 'google@example.com',
            'email_verified': True,
        }
        mock_jwk_client.return_value.get_signing_key_from_jwt.return_value.key = 'test-public-key'

        response = self.client.post(reverse('google-login'), {'credential': 'fake-google-id-token'}, format='json')

        self.assertEqual(response.status_code, 401)
