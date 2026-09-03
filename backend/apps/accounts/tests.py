import re

from django.core import mail
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from apps.core.domain_platform import NotificationEmail

from .models import Profile, RefreshToken


@override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')
class AuthenticationApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_signup_creates_unverified_account_and_queues_otp(self):
        response = self.client.post(reverse('signup'), {'email':'new@example.com','password':'A-strong-password-123','fullName':'New User'}, format='json')
        self.assertEqual(response.status_code, 201)
        user = Profile.objects.get(email='new@example.com')
        self.assertFalse(user.email_verified)
        self.assertTrue(user.signup_otp_hash)
        notification = NotificationEmail.objects.get(recipient='new@example.com', template_type='otp_verification')
        self.assertIn('Verification Code', notification.html_body)
        self.assertIn('New', notification.html_body)
        self.assertEqual(len(mail.outbox), 0)

    def test_login_requires_email_verification(self):
        Profile.objects.create_user(email='pending@example.com', password='A-strong-password-123', email_verified=False)
        response = self.client.post(reverse('login'), {'email':'pending@example.com','password':'A-strong-password-123'}, format='json')
        self.assertEqual(response.status_code, 403)
        self.assertTrue(response.data['requiresEmailVerification'])

    def test_verify_otp_issues_http_only_jwt_cookies(self):
        self.client.post(reverse('signup'), {'email':'verify@example.com','password':'A-strong-password-123'}, format='json')
        user = Profile.objects.get(email='verify@example.com')
        notification = NotificationEmail.objects.get(recipient='verify@example.com', template_type='otp_verification')
        otp = re.search(r'\b\d{6}\b', notification.html_body).group(0)
        response = self.client.post(reverse('verify-otp'), {'email':user.email,'otp':otp}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['authenticated'])
        self.assertIn('sakakrib_access', response.cookies)
        self.assertTrue(response.cookies['sakakrib_access']['httponly'])
        self.assertIn('sakakrib_refresh', response.cookies)
        self.assertEqual(RefreshToken.objects.filter(user=user, revoked_at__isnull=True).count(), 1)

    def test_authenticated_request_uses_access_cookie(self):
        user = Profile.objects.create_user(email='cookie@example.com', password='A-strong-password-123', email_verified=True)
        self.client.post(reverse('login'), {'email':user.email,'password':'A-strong-password-123'}, format='json')
        response = self.client.get(reverse('me'))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['email'], user.email)

    def test_refresh_rotates_refresh_token(self):
        user = Profile.objects.create_user(email='refresh@example.com', password='A-strong-password-123', email_verified=True)
        self.client.post(reverse('login'), {'email':user.email,'password':'A-strong-password-123'}, format='json')
        old_jti_count = RefreshToken.objects.filter(user=user, revoked_at__isnull=True).count()
        self.assertEqual(old_jti_count, 1)
        response = self.client.post(reverse('refresh'), format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(RefreshToken.objects.filter(user=user, revoked_at__isnull=True).count(), 1)
        self.assertEqual(RefreshToken.objects.filter(user=user, revoked_at__isnull=False).count(), 1)

    def test_wrong_otp_is_rejected_and_attempt_is_counted(self):
        self.client.post(reverse('signup'), {'email':'wrong@example.com','password':'A-strong-password-123'}, format='json')
        user = Profile.objects.get(email='wrong@example.com')
        response = self.client.post(reverse('verify-otp'), {'email':user.email,'otp':'000000'}, format='json')
        self.assertEqual(response.status_code, 400)
        user.refresh_from_db()
        self.assertEqual(user.signup_otp_attempts, 1)

    def test_set_role_requires_authenticated_user(self):
        response = self.client.post(reverse('set-role'), {'role':'landlord'}, format='json')
        self.assertEqual(response.status_code, 401)

    def test_session_returns_unauthenticated_without_session(self):
        response = self.client.get(reverse('session'))
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['authenticated'])
