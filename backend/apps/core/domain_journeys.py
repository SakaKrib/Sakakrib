import uuid

from django.db import models

JOURNEY_STATUS_READY = "READY"
JOURNEY_STATUS_ACTIVE = "ACTIVE"
JOURNEY_STATUS_DELIVERY_PENDING = "DELIVERY_PENDING"
JOURNEY_STATUS_COMPLETED = "COMPLETED"

JOURNEY_START_SOURCE_MOBILE_APP = "MOBILE_APP"
JOURNEY_START_SOURCE_CHROME = "CHROME"


class MovingJourney(models.Model):
    """Authoritative physical journey/tracking session for a moving booking."""

    STATUS_READY = JOURNEY_STATUS_READY
    STATUS_ACTIVE = JOURNEY_STATUS_ACTIVE
    STATUS_DELIVERY_PENDING = JOURNEY_STATUS_DELIVERY_PENDING
    STATUS_COMPLETED = JOURNEY_STATUS_COMPLETED

    START_SOURCE_MOBILE_APP = JOURNEY_START_SOURCE_MOBILE_APP
    START_SOURCE_CHROME = JOURNEY_START_SOURCE_CHROME

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    booking_id = models.UUIDField()
    mover_id = models.UUIDField()
    tracking_number = models.TextField(unique=True)
    status = models.TextField(default=JOURNEY_STATUS_READY)
    started_at = models.DateTimeField(null=True, blank=True)
    started_by = models.UUIDField(null=True, blank=True)
    start_source = models.TextField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    completed_by = models.UUIDField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "moving_journeys"
        constraints = [
            models.UniqueConstraint(fields=["booking_id"], name="moving_journeys_booking_id_key"),
            models.CheckConstraint(
                condition=models.Q(status__in=[
                    JOURNEY_STATUS_READY,
                    JOURNEY_STATUS_ACTIVE,
                    JOURNEY_STATUS_DELIVERY_PENDING,
                    JOURNEY_STATUS_COMPLETED,
                ]),
                name="moving_journeys_status_check",
            ),
            models.CheckConstraint(
                condition=models.Q(start_source__isnull=True)
                | models.Q(start_source__in=[
                    JOURNEY_START_SOURCE_MOBILE_APP,
                    JOURNEY_START_SOURCE_CHROME,
                ]),
                name="moving_journeys_start_source_check",
            ),
        ]
        indexes = [
            models.Index(fields=["booking_id"], name="mv_journey_booking_idx"),
            models.Index(fields=["mover_id", "status"], name="mv_journey_mover_st_idx"),
            models.Index(fields=["status"], name="mv_journey_status_idx"),
        ]
