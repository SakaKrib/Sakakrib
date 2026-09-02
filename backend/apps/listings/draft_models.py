from django.db import models
import uuid


class ListingDraft(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user_id = models.UUIDField()
    role = models.CharField(max_length=32)
    data = models.JSONField(default=dict)
    status = models.CharField(max_length=16, default='DRAFT')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'listing_drafts'
        ordering = ['-updated_at']
        indexes = [models.Index(fields=['user_id', 'status', '-updated_at'], name='listing_draft_user_status_idx')]
