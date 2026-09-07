from datetime import timedelta

from django.core.exceptions import ValidationError
from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import Profile

from .domain_bookings import Booking, MoverPayout
from .domain_journeys import MovingJourney
from .domain_platform import Mover, UserNotification
from .moving_lifecycle_services import confirm_moving_delivery
from .moving_payment_services import _ensure_payout, release_moving_escrow


class MovingDeliveryAuthorityTests(TestCase):
    def setUp(self):
        self.renter = Profile.objects.create_user(
            email="delivery-renter@example.com",
            full_name="Delivery Renter",
            role="renter",
        )
        self.mover_user = Profile.objects.create_user(
            email="delivery-mover@example.com",
            full_name="Delivery Mover",
            role="mover",
        )
        self.other_mover_user = Profile.objects.create_user(
            email="other-delivery-mover@example.com",
            full_name="Other Mover",
            role="mover",
        )
        self.admin = Profile.objects.create_user(
            email="delivery-admin@example.com",
            full_name="Delivery Admin",
            role="admin",
        )
        self.mover = Mover.objects.create(
            user_id=self.mover_user.id,
            driver_full_name="Delivery Mover",
            approval_status="approved",
            vehicle_type="pickup",
            payment_channel="mpesa_send_money",
        )
        self.other_mover = Mover.objects.create(
            user_id=self.other_mover_user.id,
            driver_full_name="Other Mover",
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
            booking_amount="1000.00",
            commission_amount="100.00",
            total_amount="1100.00",
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
            tracking_number="SK-MOV-20260908-DLV001",
            status=MovingJourney.STATUS_ACTIVE,
            started_at=start,
            started_by=self.mover_user.id,
            start_source=MovingJourney.START_SOURCE_MOBILE_APP,
        )
        booking.tracking_number = journey.tracking_number
        booking.save(update_fields=["tracking_number"])
        _ensure_payout(booking, self.mover)
        return booking, journey

    def test_mover_cannot_confirm_delivery(self):
        booking, journey = self._booking()

        with self.assertRaisesMessage(
            ValidationError,
            "Only the renter can confirm delivery and complete the journey",
        ):
            confirm_moving_delivery(
                user_id=self.mover_user.id,
                booking_id=booking.id,
            )

        booking.refresh_from_db()
        journey.refresh_from_db()
        self.assertEqual(booking.status, "in_progress")
        self.assertEqual(journey.status, MovingJourney.STATUS_ACTIVE)
        self.assertIsNone(booking.renter_confirmed_delivery_at)
        self.assertIsNone(journey.completed_at)

    def test_renter_confirmation_completes_journey_and_is_idempotent(self):
        booking, journey = self._booking()

        first = confirm_moving_delivery(
            user_id=self.renter.id,
            booking_id=booking.id,
        )
        second = confirm_moving_delivery(
            user_id=self.renter.id,
            booking_id=booking.id,
        )

        booking.refresh_from_db()
        journey.refresh_from_db()
        self.assertEqual(first["status"], "completed")
        self.assertFalse(first["already_confirmed"])
        self.assertEqual(second["status"], "completed")
        self.assertTrue(second["already_confirmed"])
        self.assertEqual(booking.status, "completed")
        self.assertEqual(journey.status, MovingJourney.STATUS_COMPLETED)
        self.assertEqual(journey.completed_by, self.renter.id)
        self.assertIsNotNone(journey.completed_at)
        self.assertEqual(
            UserNotification.objects.filter(
                event_key=f"moving-delivery-confirmed:renter:{booking.id}"
            ).count(),
            1,
        )
        self.assertEqual(
            UserNotification.objects.filter(
                event_key=f"moving-delivery-confirmed:mover:{booking.id}"
            ).count(),
            1,
        )

    def test_escrow_release_requires_renter_confirmation_not_mover_confirmation(self):
        booking, _ = self._booking()

        with self.assertRaisesMessage(
            ValidationError,
            "Renter must confirm safe delivery before escrow release",
        ):
            release_moving_escrow(
                admin_user_id=self.admin.id,
                booking_id=booking.id,
            )

        booking.renter_confirmed_delivery_at = timezone.now()
        booking.save(update_fields=["renter_confirmed_delivery_at"])

        result = release_moving_escrow(
            admin_user_id=self.admin.id,
            booking_id=booking.id,
        )

        payout = MoverPayout.objects.get(booking_id=booking.id)
        self.assertEqual(result["status"], "PAYOUT_PROCESSING")
        self.assertEqual(payout.final_payment_status, "processing")
