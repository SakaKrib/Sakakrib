from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.accounts.models import Profile
from .models import ListingDraft


@transaction.atomic
def save_listing_draft(profile, data, draft_id=None):
    """Persist an in-progress listing entirely in PostgreSQL.

    Drafts are owned by the authenticated Profile. They never consume listing
    entitlement and never create a marketplace listing until final submission.
    """
    owner = Profile.objects.select_for_update().get(pk=profile.id)
    role = str(getattr(owner, 'role', '') or '').strip().lower()
    if role not in {'landlord', 'real_estate'}:
        raise ValidationError('Only landlord and real-estate accounts can save listing drafts.')
    if not isinstance(data, dict):
        raise ValidationError('Draft data must be an object.')

    if draft_id:
        draft = ListingDraft.objects.select_for_update().filter(id=draft_id, user_id=owner.id, status='DRAFT').first()
        if not draft:
            raise ValidationError('Draft not found.')
        draft.data = data
        draft.save(update_fields=['data', 'updated_at'])
    else:
        draft = ListingDraft.objects.create(user_id=owner.id, role=role, data=data, status='DRAFT')

    return draft


def list_listing_drafts(profile):
    return ListingDraft.objects.filter(user_id=profile.id, status='DRAFT').order_by('-updated_at', '-created_at')


def get_listing_draft(profile, draft_id):
    return ListingDraft.objects.filter(id=draft_id, user_id=profile.id, status='DRAFT').first()


@transaction.atomic
def delete_listing_draft(profile, draft_id):
    draft = ListingDraft.objects.select_for_update().filter(id=draft_id, user_id=profile.id, status='DRAFT').first()
    if not draft:
        raise ValidationError('Draft not found.')
    draft.delete()
