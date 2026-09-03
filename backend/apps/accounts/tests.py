import re
from unittest.mock import patch

from django.core import mail
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from apps.core.domain_platform import MoverApplication, NotificationEmail

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
        self.assertIsNotNone(notification.created_at)
        self.assertEqual(len(mail.outbox), 0)

    def test_login_requires_email_verification(self):
        Profile.objects.create_user(email='pending@example.com', password='A-strong-password-123', email_verified=False)
        response = self.client.post(reverse('login'), {'email':'pending@example.com','password':'A-strong-password-123'}, format='json')
        self.assertEqual(response.status_code, 403)
        self.assertTrue(response.data['requiresEmailVerification'])

    def test_login_queues_sign_in_notification(self):
        user = Profile.objects.create_user(email='login@example.com', password='A-strong-password-123', full_name='Login User', email_verified=True)
        response = self.client.post(reverse('login'), {'email':user.email,'password':'A-strong-password-123'}, format='json')
        self.assertEqual(response.status_code, 200)
        notification = NotificationEmail.objects.get(recipient=user.email, template_type='sign_in_notification')
        self.assertIn('Successful Sign In', notification.html_body)
        self.assertIn('Login', notification.html_body)
        self.assertIn('Review Account Security', notification.html_body)

    @patch('apps.accounts.auth_service.generate_signup_otp', return_value='123456')
    def test_verify_otp_issues_http_only_jwt_cookies(self, _generate_otp):
        self.client.post(reverse('signup'), {'email':'verify@example.com','password':'A-strong-password-123'}, format='json')
        user = Profile.objects.get(email='verify@example.com')
        notification = NotificationEmail.objects.get(recipient='verify@example.com', template_type='otp_verification')
        self.assertIn('123456', notification.html_body)
        otp = re.search(r'\b123456\b', notification.html_body).group(0)
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


@override_settings(
    EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
    ADMIN_EMAIL='admin@example.com',
)
class MoverApplicationApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def _login(self, user):
        response = self.client.post(
            reverse('login'),
            {'email': user.email, 'password': 'A-strong-password-123'},
            format='json',
        )
        self.assertEqual(response.status_code, 200)

    def _application(self):
        return {
            'driver_full_name': 'Mover Applicant',
            'national_id': '12345678',
            'dl_number': 'DL123456',
            'dl_photo_url': '',
            'vehicle_type': 'pickup',
            'number_plate': 'KDA123A',
            'capacity_details': '1.5 ton pickup',
            'operating_city': 'Nairobi',
            'operating_county': 'Nairobi',
            'phone': '0712345678',
            'base_rate_kes': 1000,
            'rate_per_km_kes': 50,
            'payment_channel': 'mpesa_send_money',
            'payment_account': '0712345678',
            'insurance_policy_details': 'Valid comprehensive insurance',
            'vehicle_inspection_expiry': '2099-12-31',
            'liability_accepted': True,
            'terms_accepted': True,
            'reference_contacts': [
                {'name': 'Reference One', 'phone': '0722345678', 'relationship': 'Friend'},
            ],
            'latitude': -1.286389,
            'longitude': 36.817223,
            'location': 'Nairobi',
            'working_days': ['Monday', 'Tuesday'],
            'start_time': '08:00',
            'end_time': '18:00',
        }

    def test_mover_application_requires_mover_role_email_and_kyc(self):
        user = Profile.objects.create_user(email='renter@example.com', password='A-strong-password-123', email_verified=True, role='renter', kyc_completed=True)
        self._login(user)
        response = self.client.post(reverse('mover-application-submit'), {'p_application': self._application()}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'INVALID_ROLE')

    def test_mover_application_persists_pending_and_queues_both_emails(self):
        user = Profile.objects.create_user(email='mover@example.com', password='A-strong-password-123', full_name='Mover Applicant', email_verified=True, role='mover', kyc_completed=True)
        self._login(user)
        application = self._application()
        application['dl_photo_url'] = f'licenses/{user.id}/driving-license.jpg'
        response = self.client.post(reverse('mover-application-submit'), {'p_application': application}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['success'])
        self.assertEqual(response.data['status'], 'pending')
        user.refresh_from_db()
        self.assertEqual(user.mover_application_status, 'pending')
        saved = MoverApplication.objects.get(applicant_id=user.id)
        self.assertEqual(saved.status, 'pending')
        self.assertEqual(saved.applicant_email, user.email)
        self.assertEqual(NotificationEmail.objects.filter(recipient=user.email, template_type='mover_application_submitted').count(), 1)
        self.assertEqual(NotificationEmail.objects.filter(recipient='admin@example.com', template_type='mover_admin_notification').count(), 1)
