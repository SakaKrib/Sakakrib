from datetime import timedelta
from unittest.mock import patch

from django.core.exceptions import ValidationError
from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import Profile

from .domain_bookings import Booking, MovingInvoice
from .domain_platform import Mover
from .moving_workflow_services import confirm_mover_booking_workflow


class MovingConfirmationWorkflowTests(TestCase):
    def setUp(self):
        self.renter = Profile.objects.create_user(
            email="renter-confirm@example.com",
            full_name="Test Renter",
            role="renter",
        )
        self.mover_user = Profile.objects.create_user(
            email="mover-confirm@example.com",
            full_name="Test Mover",
            role="mover",
        )
        self.mover = Mover.objects.create(
            user_id=self.mover_user.id,
            driver_full_name="Test Mover",
            phone="0712345678",
            vehicle_type="pickup",
            number_plate="KDA123A",
            approval_status="approved",
            payment_channel="mpesa_send_money",
        )

    def _booking(self, **overrides):
        now = timezone.now()
        values = {
            "renter_id": self.renter.id,
            "mover_id": self.mover.id,
            "moving_date": (now + timedelta(days=1)).date(),
            "booking_amount": "1000.00",
            "commission_amount": "100.00",
            "total_amount": "1100.00",
            "status": "pending",
            "payment_status": "unpaid",
            "payment_method": "mpesa",
            "request_expires_at": now + timedelta(minutes=30),
            "created_at": now,
            "updated_at": now,
        }
        values.update(overrides)
        return Booking.objects.create(**values)

    def test_mover_confirmation_creates_authoritative_invoice(self):
        booking = self._booking()

        result = confirm_mover_booking_workflow(
            mover_user_id=self.mover_user.id,
            booking_id=booking.id,
        )

        booking.refresh_from_db()
        invoice = MovingInvoice.objects.get(booking_id=booking.id)

        self.assertEqual(result["status"], "confirmed")
        self.assertEqual(booking.status, "confirmed")
        self.assertEqual(invoice.amount_kes, booking.total_amount)
        self.assertEqual(invoice.renter_id, booking.renter_id)
        self.assertEqual(invoice.mover_id, booking.mover_id)
        self.assertEqual(invoice.status, "ISSUED")

    @patch(
        "apps.core.moving_workflow_services._ensure_moving_invoice",
        side_effect=ValidationError("invoice creation failed"),
    )
    def test_confirmation_rolls_back_if_invoice_creation_fails(self, _mock_ensure_invoice):
        booking = self._booking()

        with self.assertRaisesMessage(ValidationError, "invoice creation failed"):
            confirm_mover_booking_workflow(
                mover_user_id=self.mover_user.id,
                booking_id=booking.id,
            )

        booking.refresh_from_db()
        self.assertEqual(booking.status, "pending")
        self.assertFalse(MovingInvoice.objects.filter(booking_id=booking.id).exists())
