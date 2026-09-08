from datetime import timedelta

from django.core.exceptions import ValidationError
from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import Profile

from .domain_bookings import Booking
from .domain_journeys import JOURNEY_PHASE_HEADING_TO_PICKUP, JOURNEY_PHASE_IN_TRANSIT, MovingJourney
from .domain_platform import Mover
from .moving_journey_phase_views import confirm_mover_pickup, get_journey_phase
from .moving_tracking_views import start_moving_journey


class MovingJourneyPhaseTests(TestCase):
    def setUp(self):
        self.renter = Profile.objects.create_user(email="phase-renter@example.com", full_name="Phase Renter", role="renter")
        self.mover_user = Profile.objects.create_user(email="phase-mover@example.com", full_name="Phase Mover", role="mover")
        self.other_user = Profile.objects.create_user(email="phase-other@example.com", full_name="Other Mover", role="mover")
        self.mover = Mover.objects.create(
            user_id=self.mover_user.id,
            driver_full_name="Phase Mover",
            approval_status="approved",
            vehicle_type="pickup",
            payment_channel="mpesa_send_money",
        )
        self.other_mover = Mover.objects.create(
            user_id=self.other_user.id,
            driver_full_name="Other Mover",
            approval_status="approved",
            vehicle_type="pickup",
            payment_channel="mpesa_send_money",
        )

    def _booking(self, **overrides):
        start = timezone.now() + timedelta(hours=1)
        values = {
            "renter_id": self.renter.id,
            "mover_id": self.mover.id,
            "moving_date": start.date(),
            "booking_amount": "1000.00",
            "commission_amount": "100.00",
            "total_amount": "1100.00",
            "status": "confirmed",
            "payment_status": "paid",
            "payment_method": "MPESA",
            "created_at": timezone.now(),
            "updated_at": timezone.now(),
            "confirmed_at": timezone.now(),
            "scheduled_start_at": start,
            "scheduled_end_at": start + timedelta(hours=2),
        }
        values.update(overrides)
        return Booking.objects.create(**values)

    def _started_booking(self):
        booking = self._booking()
        start_moving_journey(mover_user_id=self.mover_user.id, booking_id=booking.id)
        return booking

    def test_new_journey_starts_heading_to_pickup(self):
        booking = self._started_booking()
        journey = MovingJourney.objects.get(booking_id=booking.id)
        self.assertEqual(journey.phase, JOURNEY_PHASE_HEADING_TO_PICKUP)
        self.assertIsNone(journey.pickup_confirmed_at)
        self.assertEqual(get_journey_phase(user_id=self.renter.id, booking_id=booking.id)["phase"], JOURNEY_PHASE_HEADING_TO_PICKUP)

    def test_mover_confirmation_moves_journey_into_transit(self):
        booking = self._started_booking()
        before = timezone.now()
        result = confirm_mover_pickup(mover_user_id=self.mover_user.id, booking_id=booking.id)
        after = timezone.now()
        journey = MovingJourney.objects.get(booking_id=booking.id)

        self.assertEqual(result["phase"], JOURNEY_PHASE_IN_TRANSIT)
        self.assertFalse(result["already_confirmed"])
        self.assertEqual(journey.phase, JOURNEY_PHASE_IN_TRANSIT)
        self.assertEqual(journey.pickup_confirmed_by, self.mover_user.id)
        self.assertGreaterEqual(journey.pickup_confirmed_at, before)
        self.assertLessEqual(journey.pickup_confirmed_at, after)
        self.assertEqual(get_journey_phase(user_id=self.renter.id, booking_id=booking.id)["phase"], JOURNEY_PHASE_IN_TRANSIT)

    def test_pickup_confirmation_is_idempotent(self):
        booking = self._started_booking()
        first = confirm_mover_pickup(mover_user_id=self.mover_user.id, booking_id=booking.id)
        second = confirm_mover_pickup(mover_user_id=self.mover_user.id, booking_id=booking.id)
        journey = MovingJourney.objects.get(booking_id=booking.id)

        self.assertFalse(first["already_confirmed"])
        self.assertTrue(second["already_confirmed"])
        self.assertEqual(first["pickup_confirmed_at"], second["pickup_confirmed_at"])
        self.assertEqual(journey.phase, JOURNEY_PHASE_IN_TRANSIT)

    def test_renter_cannot_confirm_pickup(self):
        booking = self._started_booking()
        with self.assertRaisesMessage(ValidationError, "Only the assigned mover can confirm pickup"):
            confirm_mover_pickup(mover_user_id=self.renter.id, booking_id=booking.id)

    def test_other_mover_cannot_confirm_pickup(self):
        booking = self._started_booking()
        with self.assertRaisesMessage(ValidationError, "Only the assigned mover can confirm pickup"):
            confirm_mover_pickup(mover_user_id=self.other_mover.user_id, booking_id=booking.id)

    def test_pickup_cannot_be_confirmed_before_journey_starts(self):
        booking = self._booking()
        with self.assertRaisesMessage(ValidationError, "The moving journey must be active before pickup can be confirmed"):
            confirm_mover_pickup(mover_user_id=self.mover_user.id, booking_id=booking.id)
