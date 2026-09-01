from django.test import TestCase
from django.utils import timezone

from .models import Profile
from .tasks import delete_unverified_account_after_3_minutes


class UnverifiedSignupCleanupTaskTests(TestCase):
    def _create_pending_user(self, **overrides):
        values = {
            "email": "pending@example.com",
            "password": "StrongPass123!",
            "email_verified": False,
            "verification_status": "pending_verification",
            "signup_verification_started_at": timezone.now(),
            "signup_otp_verified_at": None,
        }
        values.update(overrides)
        return Profile.objects.create_user(**values)

    def test_deletes_still_unverified_pending_signup(self):
        user = self._create_pending_user()
        user_id = str(user.id)

        result = delete_unverified_account_after_3_minutes.apply(args=[user_id]).get()

        self.assertTrue(result["deleted"])
        self.assertFalse(Profile.objects.filter(id=user_id).exists())

    def test_does_not_delete_verified_account(self):
        user = self._create_pending_user(email_verified=True)

        result = delete_unverified_account_after_3_minutes.apply(args=[str(user.id)]).get()

        self.assertFalse(result["deleted"])
        self.assertTrue(Profile.objects.filter(id=user.id).exists())

    def test_does_not_delete_account_that_progressed_beyond_verification(self):
        user = self._create_pending_user(verification_status="verified")

        result = delete_unverified_account_after_3_minutes.apply(args=[str(user.id)]).get()

        self.assertFalse(result["deleted"])
        self.assertTrue(Profile.objects.filter(id=user.id).exists())
