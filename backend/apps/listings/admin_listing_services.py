from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.accounts.authorization import require_admin
from apps.accounts.models import Profile
from apps.core.domain_property import PropertyUnit
from apps.core.notification_services import dispatch_user_notification
from apps.core.unit_pricing import normalize_unit_pricing, sync_listing_price
from apps.listings.services import get_listing_entitlement
from apps.subscriptions.models import SubscriptionListing

from .models import Listing


CONTENT_ROLES = {'landlord', 'real_estate'}


@transaction.atomic
def create_listing_on_behalf(admin_user, owner_id, data, units=None):
    """Create a listing for an approved landlord/real-estate owner.

    Admin posting does not consume the owner's free entitlement and does not
    fabricate a payment. Property-management listings require the owner to
    already have an ACTIVE subscription with remaining capacity, and then
    consume exactly one SubscriptionListing so capacity stays consistent.
    """
    require_admin(admin_user)

    owner = Profile.objects.select_for_update().filter(pk=owner_id).first()
    if owner is None:
        raise LookupError('Listing owner not found.')

    role = str(owner.role or '').strip().lower()
    if role not in CONTENT_ROLES:
        raise ValidationError('Listings may only be posted on behalf of landlord or real estate accounts.')
    if not owner.is_active:
        raise ValidationError('The selected listing owner is inactive.')
    if not owner.email_verified or str(owner.verification_status or '').lower() != 'verified':
        raise ValidationError('The listing owner must have a verified email and verified identity.')
    application_status = owner.landlord_application_status if role == 'landlord' else owner.real_estate_application_status
    if application_status != 'approved':
        raise ValidationError('The listing owner must have an approved application.')

    is_pms = bool(data.get('is_property_management', False))
    entitlement = None
    if is_pms:
        entitlement = get_listing_entitlement(owner, lock_subscription=True)
        if entitlement.get('subscription_status') != 'ACTIVE':
            raise ValidationError('An active PMS subscription is required for property management listings.')
        remaining = entitlement.get('subscription_listings_remaining')
        if remaining is not None and remaining <= 0:
            raise ValidationError('The owner PMS subscription listing capacity has been reached.')

    listing = Listing.objects.create(
        user_id=owner.id,
        title=data.get('title', ''),
        description=data.get('description', ''),
        city=data.get('city', ''),
        county=data.get('county', ''),
        location_search=data.get('location_search'),
        latitude=data.get('latitude'),
        longitude=data.get('longitude'),
        property_name=data.get('property_name'),
        property_type=data.get('property_type'),
        price_kes=data.get('price_kes'),
        listing_type=data.get('listing_type', 'rent'),
        deposit_required=data.get('deposit_required', False),
        deposit_structure=data.get('deposit_structure'),
        deposit_amount=data.get('deposit_amount', 0),
        size=data.get('size'),
        beds=data.get('beds', 0),
        baths=data.get('baths', 0),
        contact_phone=data.get('contact_phone') or owner.phone,
        contact_email=data.get('contact_email') or owner.email,
        social_links=data.get('social_links', []),
        booking_enabled=data.get('booking_enabled', False),
        payment_enabled=data.get('payment_enabled', False),
        is_property_management=is_pms,
        is_paid=False,
        is_published=False,
        is_draft=False,
        approval_status='pending_review',
        is_approved=False,
        status='pending',
        created_at=timezone.now(),
        updated_at=timezone.now(),
    )

    if is_pms:
        max_units = (entitlement or {}).get('max_units_per_listing')
        if max_units is not None and len(units or []) > max_units:
            raise ValidationError(f"The owner's plan allows up to {max_units} units per property.")
        for position, unit_data in enumerate(units or []):
            unit_number = str(unit_data.get('unit_number') or '').strip()
            unit_type = str(unit_data.get('unit_type') or '').strip()
            if not unit_number or not unit_type:
                raise ValidationError('Each PMS unit requires a unit number/name and unit type.')
            try:
                pricing = normalize_unit_pricing(unit_data)
            except ValueError as exc:
                raise ValidationError(f'Unit {unit_number}: {exc}')
            PropertyUnit.objects.create(
                listing_id=listing.id,
                user_id=owner.id,
                unit_number=unit_number,
                unit_type=unit_type,
                **pricing,
                deposit_amount=unit_data.get('deposit_amount') or 0,
                size=unit_data.get('size') or None,
                beds=unit_data.get('beds') or 0,
                baths=unit_data.get('baths') or 1,
                availability=unit_data.get('availability') or 'available',
                description=unit_data.get('description') or '',
                position=position,
            )

    if is_pms:
        sync_listing_price(listing.id)

    if is_pms and entitlement and entitlement.get('subscription_id'):
        key = 'subscription_id' if role == 'landlord' else 'real_estate_subscription_id'
        SubscriptionListing.objects.create(
            **{key: entitlement['subscription_id']},
            listing_id=listing.id,
            status='ACTIVE',
            activated_at=timezone.now(),
            created_at=timezone.now(),
        )

    transaction.on_commit(lambda: dispatch_user_notification(
        user_id=owner.id,
        notification_type='LISTING_POSTED_BY_ADMIN',
        title='Listing Posted by Saka Krib Administrator',
        message=f'An administrator created the listing "{listing.title}" on your behalf. It is awaiting administrator approval.',
        data={'listing_id': str(listing.id), 'listing_title': listing.title, 'posted_by_admin_id': str(admin_user.pk)},
        event_key=f'listing:admin-posted:{listing.id}',
        send_email=True,
        email_template='listing_posted',
    ))

    return listing
