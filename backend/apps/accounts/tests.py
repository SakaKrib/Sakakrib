from django.core import mail
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from .models import Profile


@override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')
class AuthenticationApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_signup_creates_unverified_account_and_sends_otp(self):
        response = self.client.post(reverse('signup'), {
            'email': 'new@example.com',
            'password': 'A-strong-password-123',
            'fullName': 'New User',
        }, format='json')

        self.assertEqual(response.status_code, 201)
        user = Profile.objects.get(email='new@example.com')
        self.assertFalse(user.email_verified)
        self.assertTrue(user.signup_otp_hash)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn('verification code', mail.outbox[0].subject.lower())

    def test_login_requires_email_verification(self):
        Profile.objects.create_user(
            email='pending@example.com',
            password='A-strong-password-123',
            email_verified=False,
        )
        response = self.client.post(reverse('login'), {
            'email': 'pending@example.com',
            'password': 'A-strong-password-123',
        }, format='json')

        self.assertEqual(response.status_code, 403)
        self.assertTrue(response.data['requiresEmailVerification'])

    def test_verify_otp_logs_user_in(self):
        signup = self.client.post(reverse('signup'), {
            'email': 'verify@example.com',
            'password': 'A-strong-password-123',
            'fullName': 'Verify User',
        }, format='json')
        self.assertEqual(signup.status_code, 201)

        user = Profile.objects.get(email='verify@example.com')
        # The test mail contains the generated six-digit code.
        body = mail.outbox[-1].body
        otp = next(part for part in body.split() if part.isdigit() and len(part) == 6)

        response = self.client.post(reverse('verify-otp'), {
            'email': user.email,
            'otp': otp,
        }, format='json')

        self.assertEqual(response.status_code, 200)
        user.refresh_from_db()
        self.assertTrue(user.email_verified)
        self.assertIsNotNone(user.signup_otp_verified_at)
        self.assertTrue(response.data['authenticated'])

    def test_wrong_otp_is_rejected_and_attempt_is_counted(self):
        self.client.post(reverse('signup'), {
            'email': 'wrong@example.com',
            'password': 'A-strong-password-123',
        }, format='json')
        user = Profile.objects.get(email='wrong@example.com')

        response = self.client.post(reverse('verify-otp'), {
            'email': user.email,
            'otp': '000000',
        }, format='json')

        self.assertEqual(response.status_code, 400)
        user.refresh_from_db()
        self.assertEqual(user.signup_otp_attempts, 1)

    def test_set_role_requires_authenticated_user(self):
        response = self.client.post(reverse('set-role'), {'role': 'landlord'}, format='json')
        self.assertEqual(response.status_code, 403)

    def test_session_returns_unauthenticated_without_session(self):
        response = self.client.get(reverse('session'))
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['authenticated'])
