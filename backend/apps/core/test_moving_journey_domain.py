import uuid

from django.db import IntegrityError, transaction
from django.test import TestCase

from apps.core.models import MovingJourney


class MovingJourneyDomainTests(TestCase):
    def _journey(self, **overrides):
        values = {
            "booking_id": uuid.uuid4(),
            "mover_id": uuid.uuid4(),
            "tracking_number": "SK-MOV-20260908-X7K4P",
        }
        values.update(overrides)
        return MovingJourney(**values)

    def test_active_journey_accepts_mobile_app_source(self):
        journey = self._journey(
            status=MovingJourney.STATUS_ACTIVE,
            started_by=uuid.uuid4(),
            start_source=MovingJourney.START_SOURCE_MOBILE_APP,
        )
        journey.full_clean()
        journey.save()
        self.assertEqual(journey.status, MovingJourney.STATUS_ACTIVE)

    def test_chrome_is_a_supported_start_source(self):
        journey = self._journey(start_source=MovingJourney.START_SOURCE_CHROME)
        journey.full_clean()
        journey.save()
        self.assertEqual(journey.start_source, MovingJourney.START_SOURCE_CHROME)

    def test_invalid_status_is_rejected(self):
        journey = self._journey(status="STOPPED")
        with self.assertRaises(Exception):
            journey.full_clean()

    def test_invalid_start_source_is_rejected(self):
        journey = self._journey(start_source="MOVER_STOPPED_IT")
        with self.assertRaises(Exception):
            journey.full_clean()

    def test_booking_and_tracking_number_are_unique(self):
        first = self._journey()
        first.full_clean()
        first.save()

        duplicate_booking = self._journey(tracking_number="SK-MOV-20260909-A1B2C")
        duplicate_booking.full_clean()
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                duplicate_booking.save(force_insert=True)

        duplicate_tracking = self._journey(
            booking_id=uuid.uuid4(),
            tracking_number=first.tracking_number,
        )
        duplicate_tracking.full_clean()
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                duplicate_tracking.save(force_insert=True)
