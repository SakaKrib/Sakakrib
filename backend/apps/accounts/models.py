import uuid
from django.db import models


class Profile(models.Model):
    """Application profile keyed by the Supabase Auth user UUID.

    Supabase Auth remains the identity provider during migration. This model
    mirrors the application-facing profile record; it is deliberately not a
    Django auth User model.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(null=True, blank=True)
    role = models.CharField(max_length=50, null=True, blank=True)
    verification_status = models.CharField(max_length=50, null=True, blank=True)
    landlord_application_status = models.CharField(max_length=50, null=True, blank=True)
    real_estate_application_status = models.CharField(max_length=50, null=True, blank=True)
    mover_application_status = models.CharField(max_length=50, null=True, blank=True)
    free_listings_used = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'profiles'

    def __str__(self):
        return self.email or str(self.id)
