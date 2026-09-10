from datetime import timedelta
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import Profile

from .domain_bookings import Booking, MoverPayout
from .domain_journeys import MovingJourney
from .domain_platform import Mover
from .moving_escrow_release import release_moving_escrow
from .moving_lifecycle_services import confirm_moving_delivery
from .moving_payment_services import _ensure_payout


class MovingBothDeliveryConfirmationTests(TestCase):
    def setUp(self):
        self.renter = Profile.objects.create_user(
            email="both-delivery-renter@example.com",
            full_name="Both Delivery Renter",
            role="renter",
        )
        self.mover_user = Profile.objects.create_user(
            email="both-delivery-mover@example.com",
            full_name="Both Delivery Mover",
            role="mover",
        )
        self.admin = Profile.objects.create_user(
            email="both-delivery-admin@example.com",
            full_name="Both Delivery Admin",
            role="admin",
        )
        self.mover = Mover.objects.create(
            user_id=self.mover_user.id,
            driver_full_name="Both Delivery Mover",
            approval_status="approved",
            vehicle_type="pickup",
            payment_channel="mpesa_send_money",
        )

    def _booking(self):
        start = timezone.now() - timedelta(minutes=30)
        booking = Booking.objects.create(
            renter_id=self.renter.id,
            mover_id=self.mover.id,
            moving_date=start.date(),
            booking_amount=Decimal("1000.00"),
            commission_amount=Decimal("100.00"),
            total_amount=Decimal("1100.00"),
            status="in_progress",
            payment_status="paid",
            payment_method="mpesa",
            created_at=start,
            updated_at=start,
            confirmed_at=start,
            scheduled_start_at=start,
            scheduled_end_at=start + timedelta(hours=2),
            started_at=start,
        )
        journey = MovingJourney.objects.create(
            booking_id=booking.id,
            mover_id=self.mover.id,
            tracking_number="SK-MOV-20260911-BOTH001",
            status=MovingJourney.STATUS_ACTIVE,
            started_at=start,
            started_by=self.mover_user.id,
            start_source=MovingJourney.START_SOURCE_CHROME,
        )
        booking.tracking_number = journey.tracking_number
        booking.save(update_fields=["tracking_number"])
        _ensure_payout(booking, self.mover)
        return booking, journey

    def test_mover_confirmation_does_not_complete_or_release_escrow(self):
        booking, journey = self._booking()

        result = confirm_moving_delivery(
            user_id=self.mover_user.id,
            booking_id=booking.id,
        )

        booking.refresh_from_db()
        journey.refresh_from_db()
        self.assertTrue(result["mover_confirmed"])
        self.assertFalse(result["renter_confirmed"])
        self.assertFalse(result["both_confirmed"])
        self.assertEqual(result["next_step"], "WAIT_FOR_OTHER_CONFIRMATION")
        self.assertEqual(booking.status, "in_progress")
        self.assertEqual(journey.status, MovingJourney.STATUS_DELIVERY_PENDING)
        self.assertIsNotNone(booking.mover_confirmed_delivery_at)
        self.assertIsNone(booking.renter_confirmed_delivery_at)

        with self.assertRaisesMessage(
            ValidationError,
            "Renter must confirm safe delivery before escrow release",
        ):
            release_moving_escrow(admin_user_id=self.admin.id, booking_id=booking.id)

    def test_renter_confirmation_completes_only_after_mover_confirmation(self):
        booking, journey = self._booking()

        first = confirm_moving_delivery(
            user_id=self.renter.id,
            booking_id=booking.id,
        )
        booking.refresh_from_db()
        self.assertTrue(first["renter_confirmed"])
        self.assertFalse(first["mover_confirmed"])
        self.assertFalse(first["both_confirmed"])
        self.assertEqual(booking.status, "in_progress")

        second = confirm_moving_delivery(
            user_id=self.mover_user.id,
            booking_id=booking.id,
        )
        booking.refresh_from_db()
        journey.refresh_from_db()
        self.assertTrue(second["renter_confirmed"])
        self.assertTrue(second["mover_confirmed"])
        self.assertTrue(second["both_confirmed"])
        self.assertEqual(second["next_step"], "ADMIN_ESCROW_RELEASE")
        self.assertEqual(booking.status, "completed")
        self.assertEqual(journey.status, MovingJourney.STATUS_COMPLETED)

    def test_escrow_release_requires_both_confirmations(self):
        booking, _ = self._booking()
        booking.renter_confirmed_delivery_at = timezone.now()
        booking.save(update_fields=["renter_confirmed_delivery_at"])

        with self.assertRaisesMessage(
            ValidationError,
            "Mover must confirm delivery before escrow release",
        ):
            release_moving_escrow(admin_user_id=self.admin.id, booking_id=booking.id)

        booking.mover_confirmed_delivery_at = timezone.now()
        booking.save(update_fields=["mover_confirmed_delivery_at"])

        result = release_moving_escrow(
            admin_user_id=self.admin.id,
            booking_id=booking.id,
        )
        payout = MoverPayout.objects.get(booking_id=booking.id)
        self.assertEqual(result["status"], "PAYOUT_PROCESSING")
        self.assertEqual(payout.final_payment_status, "processing")
