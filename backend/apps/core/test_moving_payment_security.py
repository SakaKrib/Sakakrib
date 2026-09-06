from types import SimpleNamespace
from unittest.mock import patch

from django.test import SimpleTestCase
from rest_framework.test import APIRequestFactory

from .moving_payment_views import MoverPayoutCallbackView


class MoverPayoutCallbackSecurityTests(SimpleTestCase):
    CALLBACK_SECRET = "test-secret"

    def setUp(self):
        self.factory = APIRequestFactory()
        self.view = MoverPayoutCallbackView.as_view()

    def _request(self, payload, *, authenticated=False):
        headers = {}
        if authenticated:
            headers["HTTP_X_SAKA_PAYOUT_SIGNATURE"] = self.CALLBACK_SECRET
        return self.factory.post(
            "/api/core/payments/mover-payout/callback/",
            payload,
            format="json",
            **headers,
        )

    def _payout(self):
        return SimpleNamespace(
            id="payout-1",
            payout_provider="MPESA",
            payout_provider_reference="stored-reference",
            mover_id="mover-1",
        )

    def test_provider_callback_must_match_stored_reference(self):
        payout = self._payout()
        request = self._request(
            {
                "payout_id": "payout-1",
                "provider": "MPESA",
                "provider_reference": "attacker-reference",
                "success": True,
            },
            authenticated=True,
        )
        with (
            patch("apps.core.moving_payment_views.MoverPayout.objects.filter") as filter_mock,
            patch("apps.core.moving_payment_views.settings.MPESA_PAYOUT_CALLBACK_SECRET", self.CALLBACK_SECRET, create=True),
        ):
            filter_mock.return_value.first.return_value = payout
            response = self.view(request)

        self.assertEqual(response.status_code, 400)
        self.assertIn("does not match stored payout", str(response.data["error"]))

    def test_duplicate_provider_callback_does_not_queue_success_email_again(self):
        payout = self._payout()
        request = self._request(
            {
                "payout_id": "payout-1",
                "provider": "MPESA",
                "provider_reference": "stored-reference",
                "success": True,
            },
            authenticated=True,
        )
        with (
            patch("apps.core.moving_payment_views.MoverPayout.objects.filter") as filter_mock,
            patch("apps.core.moving_payment_views.finalize_mover_payout") as finalize_mock,
            patch("apps.core.moving_payment_views.queue_mover_payout_success_emails") as email_mock,
            patch("apps.core.moving_payment_views.settings.MPESA_PAYOUT_CALLBACK_SECRET", self.CALLBACK_SECRET, create=True),
        ):
            filter_mock.return_value.first.return_value = payout
            finalize_mock.return_value = {
                "status": "released",
                "already_processed": True,
                "payout_id": "payout-1",
            }
            response = self.view(request)

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["already_processed"])
        email_mock.assert_not_called()

    def test_authenticated_secret_callback_still_requires_matching_payout_reference(self):
        payout = self._payout()
        request = self._request(
            {
                "payout_id": "payout-1",
                "provider": "MPESA",
                "provider_reference": "stored-reference",
                "success": False,
                "failure_reason": "Provider rejected request",
            },
            authenticated=True,
        )
        with (
            patch("apps.core.moving_payment_views.MoverPayout.objects.filter") as filter_mock,
            patch("apps.core.moving_payment_views.finalize_mover_payout") as finalize_mock,
            patch("apps.core.moving_payment_views.Mover.objects.filter") as mover_filter_mock,
            patch("apps.core.moving_payment_views.settings.MPESA_PAYOUT_CALLBACK_SECRET", self.CALLBACK_SECRET, create=True),
        ):
            filter_mock.return_value.first.return_value = payout
            mover_filter_mock.return_value.first.return_value = None
            finalize_mock.return_value = {
                "status": "failed",
                "payout_id": "payout-1",
            }
            response = self.view(request)

        self.assertEqual(response.status_code, 200)
        finalize_mock.assert_called_once_with(
            payout_id="payout-1",
            provider="MPESA",
            provider_reference="stored-reference",
            provider_transaction_id=None,
            success=False,
            failure_reason="Provider rejected request",
        )
