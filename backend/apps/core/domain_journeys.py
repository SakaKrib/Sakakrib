import uuid

from django.db import models


class MovingJourney(models.Model):
    """Authoritative physical journey/tracking session for a moving booking."""

    STATUS_READY = "READY"
    STATUS_ACTIVE = "ACTIVE"
    STATUS_DELIVERY_PENDING = "DELIVERY_PENDING"
    STATUS_COMPLETED = "COMPLETED"

    START_SOURCE_MOBILE_APP = "MOBILE_APP"
    START_SOURCE_CHROME = "CHROME"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    booking_id = models.UUIDField()
    mover_id = models.UUIDField()
    tracking_number = models.TextField(unique=True)
    status = models.TextField(default=STATUS_READY)
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
                    STATUS_READY,
                    STATUS_ACTIVE,
                    STATUS_DELIVERY_PENDING,
                    STATUS_COMPLETED,
                ]),
                name="moving_journeys_status_check",
            ),
            models.CheckConstraint(
                condition=models.Q(start_source__isnull=True)
                | models.Q(start_source__in=[START_SOURCE_MOBILE_APP, START_SOURCE_CHROME]),
                name="moving_journeys_start_source_check",
            ),
        ]
        indexes = [
            models.Index(fields=["booking_id"], name="moving_journeys_booking_idx"),
            models.Index(fields=["mover_id", "status"], name="moving_journeys_mover_status_idx"),
            models.Index(fields=["status"], name="moving_journeys_status_idx"),
        ]
