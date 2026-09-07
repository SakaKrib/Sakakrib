from datetime import timedelta

from django.core.exceptions import ValidationError
from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import Profile

from .domain_bookings import Booking, MovingTrackingPoint
from .domain_journeys import MovingJourney
from .domain_platform import Mover
from .moving_tracking_views import (
    _tracking_health,
    record_mover_location,
    start_moving_journey,
)


class MovingTrackingTests(TestCase):
    def setUp(self):
        self.renter = Profile.objects.create_user(
            email="tracking-renter@example.com",
            full_name="Tracking Renter",
            role="renter",
        )
        self.mover_user = Profile.objects.create_user(
            email="tracking-mover@example.com",
            full_name="Tracking Mover",
            role="mover",
        )
        self.other_mover_user = Profile.objects.create_user(
            email="tracking-other@example.com",
            full_name="Other Mover",
            role="mover",
        )
        self.mover = Mover.objects.create(
            user_id=self.mover_user.id,
            driver_full_name="Tracking Mover",
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

    def _booking(self, **overrides):
        start = timezone.now() + timedelta(hours=1)
        values = {
            "renter_id": self.renter.id,
            "mover_id": self.mover.id,
            "pickup_address": "Pickup",
            "dropoff_address": "Dropoff",
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

    def _active_booking(self):
        booking = self._booking()
        start_moving_journey(
            mover_user_id=self.mover_user.id,
            booking_id=booking.id,
            source=MovingJourney.START_SOURCE_CHROME,
        )
        booking.refresh_from_db()
        return booking

    def test_mover_can_record_location_for_active_paid_journey(self):
        booking = self._active_booking()

        result = record_mover_location(
            mover_user_id=self.mover_user.id,
            booking_id=booking.id,
            latitude=-1.286389,
            longitude=36.817223,
            accuracy_meters=8.5,
            speed_kph=31.2,
            heading_degrees=180,
        )

        self.assertTrue(result["accepted"])
        self.assertFalse(result["throttled"])
        point = MovingTrackingPoint.objects.get(booking_id=booking.id)
        booking.refresh_from_db()
        mover = Mover.objects.get(pk=self.mover.id)
        self.assertEqual(point.latitude, -1.286389)
        self.assertEqual(point.longitude, 36.817223)
        self.assertEqual(booking.last_known_latitude, -1.286389)
        self.assertEqual(booking.last_known_longitude, 36.817223)
        self.assertEqual(mover.current_latitude, -1.286389)
        self.assertEqual(mover.current_longitude, 36.817223)

    def test_wrong_mover_cannot_record_location(self):
        booking = self._active_booking()

        with self.assertRaisesMessage(ValidationError, "Booking not found or unauthorized"):
            record_mover_location(
                mover_user_id=self.other_mover.user_id,
                booking_id=booking.id,
                latitude=-1.28,
                longitude=36.82,
            )

        self.assertFalse(MovingTrackingPoint.objects.filter(booking_id=booking.id).exists())

    def test_renter_cannot_record_location(self):
        booking = self._active_booking()

        with self.assertRaisesMessage(ValidationError, "Booking not found or unauthorized"):
            record_mover_location(
                mover_user_id=self.renter.id,
                booking_id=booking.id,
                latitude=-1.28,
                longitude=36.82,
            )

        self.assertFalse(MovingTrackingPoint.objects.filter(booking_id=booking.id).exists())

    def test_tracking_rejects_invalid_coordinates_and_telemetry(self):
        booking = self._active_booking()
        invalid_cases = [
            ({"latitude": 91, "longitude": 36.82}, "Invalid coordinates"),
            ({"latitude": -1.28, "longitude": 181}, "Invalid coordinates"),
            ({"latitude": -1.28, "longitude": 36.82, "accuracy_meters": -1}, "Invalid accuracy"),
            ({"latitude": -1.28, "longitude": 36.82, "speed_kph": 301}, "Invalid speed"),
            ({"latitude": -1.28, "longitude": 36.82, "heading_degrees": 360}, "Invalid heading"),
        ]
        for payload, message in invalid_cases:
            with self.subTest(message=message):
                with self.assertRaisesMessage(ValidationError, message):
                    record_mover_location(
                        mover_user_id=self.mover_user.id,
                        booking_id=booking.id,
                        **payload,
                    )
        self.assertFalse(MovingTrackingPoint.objects.filter(booking_id=booking.id).exists())

    def test_tracking_is_throttled_within_five_seconds(self):
        booking = self._active_booking()
        first = record_mover_location(
            mover_user_id=self.mover_user.id,
            booking_id=booking.id,
            latitude=-1.286,
            longitude=36.817,
        )
        second = record_mover_location(
            mover_user_id=self.mover_user.id,
            booking_id=booking.id,
            latitude=-1.287,
            longitude=36.818,
        )

        self.assertTrue(first["accepted"])
        self.assertFalse(first["throttled"])
        self.assertFalse(second["accepted"])
        self.assertTrue(second["throttled"])
        self.assertEqual(MovingTrackingPoint.objects.filter(booking_id=booking.id).count(), 1)

    def test_tracking_rejects_completed_journey(self):
        booking = self._active_booking()
        journey = MovingJourney.objects.get(booking_id=booking.id)
        journey.status = MovingJourney.STATUS_COMPLETED
        journey.completed_at = timezone.now()
        journey.completed_by = self.renter.id
        journey.save(update_fields=["status", "completed_at", "completed_by"])
        booking.status = "completed"
        booking.completed_at = timezone.now()
        booking.save(update_fields=["status", "completed_at"])

        with self.assertRaisesMessage(ValidationError, "Journey is not active"):
            record_mover_location(
                mover_user_id=self.mover_user.id,
                booking_id=booking.id,
                latitude=-1.28,
                longitude=36.82,
            )

    def test_tracking_health_distinguishes_healthy_stale_and_offline(self):
        now = timezone.now()
        self.assertEqual(_tracking_health(None, now=now)["status"], "OFFLINE")
        healthy = _tracking_health(now - timedelta(seconds=30), now=now)
        stale = _tracking_health(now - timedelta(seconds=31), now=now)
        offline = _tracking_health(now - timedelta(seconds=121), now=now)
        self.assertEqual(healthy, {"status": "HEALTHY", "is_live": True, "age_seconds": 30})
        self.assertEqual(stale, {"status": "STALE", "is_live": False, "age_seconds": 31})
        self.assertEqual(offline, {"status": "OFFLINE", "is_live": False, "age_seconds": 121})

    def test_tracking_health_keeps_exact_stale_boundary(self):
        now = timezone.now()
        boundary = _tracking_health(now - timedelta(seconds=120), now=now)
        self.assertEqual(boundary, {"status": "STALE", "is_live": False, "age_seconds": 120})

    def test_accepted_location_updates_booking_and_mover_last_known_position(self):
        booking = self._active_booking()
        record_mover_location(
            mover_user_id=self.mover_user.id,
            booking_id=booking.id,
            latitude=-1.3001,
            longitude=36.8002,
        )

        booking.refresh_from_db()
        mover = Mover.objects.get(pk=self.mover.id)
        self.assertEqual(booking.last_known_latitude, -1.3001)
        self.assertEqual(booking.last_known_longitude, 36.8002)
        self.assertIsNotNone(booking.last_location_at)
        self.assertEqual(mover.current_latitude, -1.3001)
        self.assertEqual(mover.current_longitude, 36.8002)
        self.assertIsNotNone(mover.location_updated_at)
