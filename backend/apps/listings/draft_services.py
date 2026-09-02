from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.accounts.models import Profile
from apps.core.domain_property import PropertyUnit
from .models import Listing


@transaction.atomic
def _sync_draft_units(owner, draft, data):
    """Mirror the form's PMS units into property_units while the listing is a draft."""
    draft_ui = data.get('draft_ui') if isinstance(data, dict) else None
    raw_units = draft_ui.get('units', []) if isinstance(draft_ui, dict) else []
    if not isinstance(raw_units, list):
        return

    incoming_ids = set()
    for position, raw in enumerate(raw_units):
        if not isinstance(raw, dict):
            continue
        raw_id = str(raw.get('id') or '').strip()
        if not raw_id:
            raw_id = str(__import__('uuid').uuid4())
        try:
            unit_id = __import__('uuid').UUID(raw_id)
        except (ValueError, AttributeError):
            raise ValidationError('Each property unit must have a valid ID.')
        incoming_ids.add(unit_id)

        try:
            rent = raw.get('rent')
            beds = int(raw.get('beds') or 0)
            baths = int(raw.get('baths') or 0)
        except (TypeError, ValueError):
            raise ValidationError('Property unit rent, beds, and baths must be valid numbers.')
        if beds < 0 or baths < 0:
            raise ValidationError('Property unit beds and baths cannot be negative.')

        defaults = {
            'listing_id': draft.id,
            'user_id': owner.id,
            'unit_number': str(raw.get('unitNumber') or '').strip(),
            'unit_type': str(raw.get('unitType') or '').strip(),
            'rent': rent or 0,
            'deposit_amount': raw.get('depositAmount') or 0,
            'size': str(raw.get('size') or '').strip() or None,
            'beds': beds,
            'baths': baths,
            'availability': str(raw.get('availability') or 'available').lower(),
            'description': str(raw.get('description') or '').strip() or None,
            'position': position,
            'updated_at': timezone.now(),
        }
        if defaults['availability'] not in {'available', 'occupied', 'reserved'}:
            raise ValidationError('Invalid property unit availability.')
        PropertyUnit.objects.update_or_create(
            id=unit_id,
            listing_id=draft.id,
            user_id=owner.id,
            defaults=defaults,
        )

    PropertyUnit.objects.filter(listing_id=draft.id, user_id=owner.id).exclude(id__in=incoming_ids).delete()


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

    if role == 'landlord' and draft.is_property_management or role == 'real_estate' and draft.is_property_management:
        _sync_draft_units(owner, draft, data)
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
    PropertyUnit.objects.filter(listing_id=draft.id, user_id=profile.id).delete()
    draft.delete()
