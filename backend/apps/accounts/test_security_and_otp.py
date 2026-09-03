from datetime import timedelta
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from django.core.files.storage import default_storage
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from .auth_service import OTP_EXPIRY_SECONDS, OTP_MAX_SENDS, send_signup_otp, verify_signup_otp
from .models import Profile


class PrivateDocumentAccessTests(TestCase):
    def setUp(self):
        self.owner = Profile.objects.create_user(
            email='owner@example.com', password='Password123!', email_verified=True
        )
        self.other = Profile.objects.create_user(
            email='other@example.com', password='Password123!', email_verified=True
        )
        self.admin = Profile.objects.create_user(
            email='admin@example.com', password='Password123!', email_verified=True,
            is_staff=True, is_superuser=True, is_admin=True, role='admin'
        )
        self.client = APIClient()

    def test_private_document_is_owner_or_admin_only(self):
        with TemporaryDirectory() as media_root, override_settings(MEDIA_ROOT=media_root):
            path = f'kyc-documents/{self.owner.pk}/id-test.jpg'
            default_storage.save(path, b'private-test-document')

            self.client.force_authenticate(self.owner)
            owner_response = self.client.get(
                '/api/accounts/documents/view/', {'bucket': 'kyc-documents', 'path': path}
            )
            self.assertEqual(owner_response.status_code, 200)

            self.client.force_authenticate(self.other)
            other_response = self.client.get(
                '/api/accounts/documents/view/', {'bucket': 'kyc-documents', 'path': path}
            )
            self.assertEqual(other_response.status_code, 403)

            self.client.force_authenticate(self.admin)
            admin_response = self.client.get(
                '/api/accounts/documents/view/', {'bucket': 'kyc-documents', 'path': path}
            )
            self.assertEqual(admin_response.status_code, 200)


class OtpPolicyTests(TestCase):
    @patch('apps.accounts.auth_service.queue_email')
    def test_otp_expires_in_one_minute_and_allows_only_three_sends(self, queue_email):
        user = Profile.objects.create_user(
            email='otp@example.com', password='Password123!', email_verified=False
        )
        now = timezone.now()

        send_signup_otp(user, now=now)
        user.refresh_from_db()
        self.assertEqual(user.signup_otp_trial_count, 1)
        self.assertEqual(
            int((user.signup_otp_expires_at - now).total_seconds()), OTP_EXPIRY_SECONDS
        )

        send_signup_otp(user, now=now + timedelta(seconds=60))
        user.refresh_from_db()
        send_signup_otp(user, now=now + timedelta(seconds=120))
        user.refresh_from_db()
        self.assertEqual(user.signup_otp_trial_count, OTP_MAX_SENDS)

        with self.assertRaises(ValueError):
            send_signup_otp(user, now=now + timedelta(seconds=180))

    def test_expired_otp_is_rejected(self):
        user = Profile.objects.create_user(
            email='expired@example.com', password='Password123!', email_verified=False
        )
        now = timezone.now()
        with patch('apps.accounts.auth_service.queue_email'):
            send_signup_otp(user, now=now)
        user.refresh_from_db()
        user.signup_otp_expires_at = now - timedelta(seconds=1)
        user.save(update_fields=['signup_otp_expires_at'])

        with self.assertRaisesMessage(ValueError, 'verification code has expired'):
            verify_signup_otp(user, '000000', now=now)
