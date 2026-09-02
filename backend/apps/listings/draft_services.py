from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.accounts.models import Profile
from .models import Listing


@transaction.atomic
def save_listing_draft(profile, data, draft_id=None):
    owner = Profile.objects.select_for_update().get(pk=profile.id)
    role = str(getattr(owner, 'role', '') or '').strip().lower()
    if role not in {'landlord', 'real_estate'}:
        raise ValidationError('Only landlord and real-estate accounts can save listing drafts.')
    if not isinstance(data, dict):
        raise ValidationError('Draft data must be an object.')

    draft = None
    if draft_id:
        draft = Listing.objects.select_for_update().filter(id=draft_id, user_id=owner.id, is_draft=True).first()
        if not draft:
            raise ValidationError('Draft not found.')

    defaults = {
        'title': str(data.get('title') or ''),
        'description': str(data.get('description') or ''),
        'city': str(data.get('city') or ''),
        'county': str(data.get('county') or ''),
        'location_search': data.get('location_search'),
        'latitude': data.get('latitude'),
        'longitude': data.get('longitude'),
        'property_name': data.get('property_name'),
        'property_type': data.get('property_type'),
        'price_kes': data.get('price_kes'),
        'listing_type': data.get('listing_type') or 'rent',
        'deposit_required': bool(data.get('deposit_required', False)),
        'deposit_structure': data.get('deposit_structure'),
        'deposit_amount': data.get('deposit_amount') or 0,
        'size': data.get('size'),
        'beds': data.get('beds') or 0,
        'baths': data.get('baths') or 0,
        'contact_phone': data.get('contact_phone'),
        'contact_email': data.get('contact_email'),
        'social_links': data.get('social_links') if isinstance(data.get('social_links'), list) else [],
        'booking_enabled': bool(data.get('booking_enabled', False)),
        'payment_enabled': bool(data.get('payment_enabled', False)),
        'is_property_management': bool(data.get('is_property_management', False)),
        'is_paid': False,
        'is_published': False,
        'is_draft': True,
        'approval_status': 'pending_review',
        'is_approved': False,
        'status': 'pending',
        'draft_data': data,
        'updated_at': timezone.now(),
    }
    if draft:
        for field, value in defaults.items():
            setattr(draft, field, value)
        draft.save()
    else:
        draft = Listing.objects.create(user_id=owner.id, **defaults)
    return draft


def list_listing_drafts(profile):
    return Listing.objects.filter(user_id=profile.id, is_draft=True).order_by('-updated_at', '-created_at')


def get_listing_draft(profile, draft_id):
    return Listing.objects.filter(id=draft_id, user_id=profile.id, is_draft=True).first()


@transaction.atomic
def delete_listing_draft(profile, draft_id):
    draft = Listing.objects.select_for_update().filter(id=draft_id, user_id=profile.id, is_draft=True).first()
    if not draft:
        raise ValidationError('Draft not found.')
    draft.delete()
