import uuid
from datetime import timedelta

from django.core.exceptions import ValidationError
from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import Profile

from .domain_bookings import Booking, ChatMessage
from .domain_journeys import MovingJourney
from .domain_platform import Mover, NotificationEmail, UserNotification
from .moving_tracking_views import start_moving_journey


class MovingJourneyStartTests(TestCase):
    def setUp(self):
        self.renter = Profile.objects.create_user(
            email="renter@example.com",
            full_name="Test Renter",
            role="renter",
        )
        self.mover_user = Profile.objects.create_user(
            email="mover@example.com",
            full_name="Test Mover",
            role="mover",
        )
        self.other_user = Profile.objects.create_user(
            email="other@example.com",
            full_name="Other User",
            role="mover",
        )
        self.mover = Mover.objects.create(
            user_id=self.mover_user.id,
            driver_full_name="Test Mover",
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

    def test_start_creates_authoritative_journey_and_uses_server_time(self):
        booking = self._booking()
        before_start = timezone.now()

        result = start_moving_journey(
            mover_user_id=self.mover_user.id,
            booking_id=booking.id,
            source=MovingJourney.START_SOURCE_MOBILE_APP,
        )
        after_start = timezone.now()

        journey = MovingJourney.objects.get(booking_id=booking.id)
        booking.refresh_from_db()
        self.assertEqual(result["status"], "started")
        self.assertEqual(result["source"], MovingJourney.START_SOURCE_MOBILE_APP)
        self.assertEqual(journey.status, MovingJourney.STATUS_ACTIVE)
        self.assertEqual(journey.started_by, self.mover_user.id)
        self.assertGreaterEqual(journey.started_at, before_start)
        self.assertLessEqual(journey.started_at, after_start)
        self.assertEqual(booking.status, "in_progress")
        self.assertEqual(booking.started_at, journey.started_at)
        self.assertEqual(booking.tracking_number, journey.tracking_number)
        self.assertRegex(journey.tracking_number, r"^SK-MOV-\d{8}-[A-Z0-9]{6}$")

    def test_chrome_start_is_supported(self):
        booking = self._booking()
        result = start_moving_journey(
            mover_user_id=self.mover_user.id,
            booking_id=booking.id,
            source=MovingJourney.START_SOURCE_CHROME,
        )
        journey = MovingJourney.objects.get(booking_id=booking.id)
        self.assertEqual(result["source"], MovingJourney.START_SOURCE_CHROME)
        self.assertEqual(journey.start_source, MovingJourney.START_SOURCE_CHROME)

    def test_duplicate_start_is_idempotent_and_does_not_duplicate_communications(self):
        booking = self._booking()
        first = start_moving_journey(mover_user_id=self.mover_user.id, booking_id=booking.id)
        second = start_moving_journey(mover_user_id=self.mover_user.id, booking_id=booking.id)

        self.assertEqual(second["status"], "already_started")
        self.assertEqual(second["journey_id"], first["journey_id"])
        self.assertEqual(second["tracking_number"], first["tracking_number"])
        self.assertEqual(MovingJourney.objects.filter(booking_id=booking.id).count(), 1)
        self.assertEqual(UserNotification.objects.filter(event_key=f"moving-started:renter:{booking.id}").count(), 1)
        self.assertEqual(UserNotification.objects.filter(event_key=f"moving-started:mover:{booking.id}").count(), 1)
        self.assertEqual(NotificationEmail.objects.filter(recipient="renter@example.com", template_type="moving_started").count(), 1)
        self.assertEqual(ChatMessage.objects.filter(conversation_id__contains=str(self.renter.id), message_type="system").count(), 1)

    def test_wrong_mover_cannot_start(self):
        booking = self._booking()
        with self.assertRaisesMessage(ValidationError, "Only the assigned mover can start the journey"):
            start_moving_journey(mover_user_id=self.other_mover.user_id, booking_id=booking.id)
        self.assertFalse(MovingJourney.objects.filter(booking_id=booking.id).exists())

    def test_unpaid_booking_cannot_start(self):
        booking = self._booking(payment_status="unpaid")
        with self.assertRaisesMessage(ValidationError, "Booking must be paid before starting"):
            start_moving_journey(mover_user_id=self.mover_user.id, booking_id=booking.id)
        self.assertFalse(MovingJourney.objects.filter(booking_id=booking.id).exists())

    def test_unconfirmed_booking_cannot_start(self):
        booking = self._booking(status="pending")
        with self.assertRaisesMessage(ValidationError, "Booking must be confirmed before starting"):
            start_moving_journey(mover_user_id=self.mover_user.id, booking_id=booking.id)
        self.assertFalse(MovingJourney.objects.filter(booking_id=booking.id).exists())

    def test_cancelled_booking_cannot_start(self):
        booking = self._booking(status="cancelled")
        with self.assertRaisesMessage(ValidationError, "Cancelled booking cannot start a journey"):
            start_moving_journey(mover_user_id=self.mover_user.id, booking_id=booking.id)
        self.assertFalse(MovingJourney.objects.filter(booking_id=booking.id).exists())

    def test_tracking_number_is_not_regenerated_on_retry(self):
        booking = self._booking()
        first = start_moving_journey(mover_user_id=self.mover_user.id, booking_id=booking.id)
        booking.refresh_from_db()
        original = booking.tracking_number
        retry = start_moving_journey(mover_user_id=self.mover_user.id, booking_id=booking.id)
        booking.refresh_from_db()
        journey = MovingJourney.objects.get(booking_id=booking.id)
        self.assertEqual(retry["tracking_number"], original)
        self.assertEqual(booking.tracking_number, original)
        self.assertEqual(journey.tracking_number, original)
        self.assertEqual(retry["journey_id"], first["journey_id"])

    def test_invalid_source_is_rejected_before_state_change(self):
        booking = self._booking()
        with self.assertRaisesMessage(ValidationError, "Invalid journey start source"):
            start_moving_journey(mover_user_id=self.mover_user.id, booking_id=booking.id, source="UNKNOWN")
        booking.refresh_from_db()
        self.assertEqual(booking.status, "confirmed")
        self.assertIsNone(booking.started_at)
        self.assertFalse(MovingJourney.objects.filter(booking_id=booking.id).exists())
