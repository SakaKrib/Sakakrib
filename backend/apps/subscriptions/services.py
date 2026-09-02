from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.listings.models import Listing
from .constants import FREE_LISTING_LIMIT, INDIVIDUAL_LISTING_PRICE_KES
from .models import LandlordSubscription, RealEstateSubscription, SubscriptionListing, SubscriptionPlan


def get_current_subscription(profile):
    now = timezone.now()
    if profile.role == 'landlord':
        return LandlordSubscription.objects.filter(landlord_id=profile.id).filter(Q(status='ACTIVE', current_period_end__gt=now) | Q(status='GRACE_PERIOD', grace_period_end__gt=now)).order_by('-created_at').first()
    if profile.role == 'real_estate':
        return RealEstateSubscription.objects.filter(real_estate_id=profile.id).filter(Q(status='ACTIVE', current_period_end__gt=now) | Q(status='GRACE_PERIOD', grace_period_end__gt=now)).order_by('-created_at').first()
    return None


def get_subscription_plan(subscription):
    return SubscriptionPlan.objects.filter(pk=subscription.plan_id).first() if subscription else None


def get_subscription_listing_usage(profile, subscription):
    if not subscription:
        return 0
    owned = Listing.objects.filter(user_id=profile.id).values('id')
    key = 'subscription_id' if profile.role == 'landlord' else 'real_estate_subscription_id'
    return SubscriptionListing.objects.filter(**{key: subscription.id}, status='ACTIVE', listing_id__in=owned).count()


def get_subscription_access(profile):
    """Expose the same authoritative entitlement decision used for listing creation."""
    from apps.listings.services import get_listing_entitlement
    entitlement = get_listing_entitlement(profile)
    return {
        **entitlement,
        'free_limit': entitlement.get('free_limit', FREE_LISTING_LIMIT),
        'individual_listing_price_kes': entitlement.get('individual_listing_price_kes', INDIVIDUAL_LISTING_PRICE_KES),
    }


def get_pms_access(profile):
    """Return the authoritative PMS entitlement for either PMS-enabled role.

    PMS access is deliberately separate from listing entitlement. A paid
    subscription is required; ACTIVE permits full access and GRACE_PERIOD
    permits read-only continuity. Role, identity verification and the
    role-specific application approval are checked server-side.
    """
    if not profile or not profile.is_authenticated:
        return {'allowed': False, 'reason': 'AUTHENTICATION_REQUIRED', 'read_only': False}

    if profile.role not in {'landlord', 'real_estate'}:
        return {'allowed': False, 'reason': 'PMS_ROLE_REQUIRED', 'read_only': False}

    if str(getattr(profile, 'verification_status', '')).lower() != 'verified' or not getattr(profile, 'kyc_completed', False):
        return {'allowed': False, 'reason': 'IDENTITY_VERIFICATION_REQUIRED', 'read_only': False}

    application_field = 'landlord_application_status' if profile.role == 'landlord' else 'real_estate_application_status'
    if getattr(profile, application_field, None) != 'approved':
        return {
            'allowed': False,
            'reason': 'LANDLORD_APPLICATION_NOT_APPROVED' if profile.role == 'landlord' else 'REAL_ESTATE_APPLICATION_NOT_APPROVED',
            'read_only': False,
        }

    subscription = get_current_subscription(profile)
    if not subscription:
        return {'allowed': False, 'reason': 'ACTIVE_SUBSCRIPTION_REQUIRED', 'read_only': False, 'role': profile.role}

    read_only = subscription.status == 'GRACE_PERIOD'
    return {
        'allowed': True,
        'reason': 'SUBSCRIPTION_ACTIVE' if not read_only else 'SUBSCRIPTION_GRACE_PERIOD',
        'read_only': read_only,
        'role': profile.role,
        'subscription_id': str(subscription.id),
        'subscription_status': subscription.status,
    }


def _pms_listing_key(profile):
    if profile.role == 'landlord':
        return 'subscription_id'
    if profile.role == 'real_estate':
        return 'real_estate_subscription_id'
    raise ValueError('PMS is available only to landlord and real-estate accounts.')


def _listing_payload(listing, link=None):
    return {
        'id': str(listing.id),
        'title': listing.title,
        'city': listing.city,
        'county': listing.county,
        'price_kes': listing.price_kes,
        'is_published': listing.is_published,
        'status': listing.status,
        'approval_status': listing.approval_status,
        'is_approved': listing.is_approved,
        'is_property_management': listing.is_property_management,
        'subscription_listing_id': str(link.id) if link else None,
        'subscription_id': str(link.subscription_id) if link and link.subscription_id else None,
        'activated_at': link.activated_at if link else None,
        'deactivated_at': link.deactivated_at if link else None,
    }


def get_my_pms_listings(profile):
    subscription = get_current_subscription(profile)
    if not subscription:
        return []
    key = _pms_listing_key(profile)
    links = SubscriptionListing.objects.filter(**{key: subscription.id}, status='ACTIVE')
    listing_ids = links.values_list('listing_id', flat=True)
    listings = Listing.objects.filter(id__in=listing_ids, user_id=profile.id).order_by('created_at')
    link_by_listing = {str(link.listing_id): link for link in links}
    return [_listing_payload(listing, link_by_listing.get(str(listing.id))) for listing in listings]


def get_available_pms_listings(profile):
    subscription = get_current_subscription(profile)
    if not subscription:
        return []
    key = _pms_listing_key(profile)
    linked_ids = SubscriptionListing.objects.filter(**{key: subscription.id}, status='ACTIVE').values('listing_id')
    # Match the legacy contract: available PMS candidates are the owner's
    # listings that are not already attached to this subscription and are not
    # already flagged as property-management managed.
    listings = Listing.objects.filter(user_id=profile.id, is_property_management=False).exclude(id__in=linked_ids).order_by('-created_at')
    return [_listing_payload(listing) for listing in listings]


def get_pms_unit_count(profile):
    subscription = get_current_subscription(profile)
    if not subscription:
        return {'unit_count': 0, 'max_units': None, 'remaining_units': None}
    plan = get_subscription_plan(subscription)
    key = _pms_listing_key(profile)
    managed_count = SubscriptionListing.objects.filter(**{key: subscription.id}, status='ACTIVE').count()
    max_listings = plan.max_listings if plan else None
    return {
        # The existing frontend names this value unit_count, but the
        # production PMS contract counts managed listings/properties.
        'unit_count': managed_count,
        'max_units': max_listings,
        'remaining_units': None if max_listings is None else max(0, max_listings - managed_count),
    }


def add_listing_to_pms(profile, listing_id):
    access = get_pms_access(profile)
    if not access.get('allowed'):
        raise ValueError(access.get('reason', 'PMS access denied.'))
    if access.get('read_only'):
        raise ValueError('PMS is read-only during the grace period.')
    if profile.role != 'landlord':
        raise ValueError('PMS listing management is currently available only to landlord accounts.')

    try:
        listing = Listing.objects.get(pk=listing_id, user_id=profile.id)
    except Listing.DoesNotExist as exc:
        raise ValueError('Listing not found or not owned by you.') from exc

    key = _pms_listing_key(profile)
    with transaction.atomic():
        subscription = LandlordSubscription.objects.select_for_update().filter(pk=access['subscription_id'], landlord_id=profile.id).first()
        if not subscription or subscription.status not in {'ACTIVE', 'GRACE_PERIOD'}:
            raise ValueError('PMS subscription is not active.')
        plan = get_subscription_plan(subscription)
        if not plan:
            raise ValueError('PMS subscription plan not found.')

        existing = SubscriptionListing.objects.filter(**{key: subscription.id, 'listing_id': listing.id}).first()
        if existing and existing.status == 'ACTIVE':
            raise ValueError('Listing is already managed by this PMS subscription.')

        active_count = SubscriptionListing.objects.filter(**{key: subscription.id}, status='ACTIVE').count()
        if plan.max_listings is not None and active_count >= plan.max_listings:
            raise ValueError(f'Your {plan.name} PMS plan supports a maximum of {plan.max_listings} managed listings. Please upgrade your PMS plan.')

        now = timezone.now()
        if existing:
            existing.status = 'ACTIVE'
            existing.activated_at = now
            existing.deactivated_at = None
            existing.save(update_fields=['status', 'activated_at', 'deactivated_at'])
            link = existing
        else:
            link = SubscriptionListing.objects.create(
                subscription_id=subscription.id,
                listing_id=listing.id,
                status='ACTIVE',
                activated_at=now,
                created_at=now,
            )

    return {
        'success': True,
        'subscription_id': str(subscription.id),
        'listing_id': str(listing.id),
        'plan': plan.name,
        'managed_listings': active_count + 1,
        'max_listings': plan.max_listings,
        'subscription_listing_id': str(link.id),
    }


def remove_listing_from_pms(profile, listing_id):
    access = get_pms_access(profile)
    if not access.get('allowed'):
        raise ValueError(access.get('reason', 'PMS access denied.'))
    if access.get('read_only'):
        raise ValueError('PMS is read-only during the grace period.')
    if profile.role != 'landlord':
        raise ValueError('PMS listing management is currently available only to landlord accounts.')

    subscription = LandlordSubscription.objects.filter(pk=access['subscription_id'], landlord_id=profile.id).first()
    if not subscription:
        raise ValueError('PMS subscription is not active.')

    with transaction.atomic():
        link = SubscriptionListing.objects.filter(subscription_id=subscription.id, listing_id=listing_id, status='ACTIVE').first()
        if not link:
            raise ValueError('Listing is not currently managed by this PMS subscription.')
        if not Listing.objects.filter(pk=listing_id, user_id=profile.id).exists():
            raise ValueError('Listing not found or not owned by you.')
        link.status = 'INACTIVE'
        link.deactivated_at = timezone.now()
        link.save(update_fields=['status', 'deactivated_at'])

    return {
        'success': True,
        'subscription_id': str(subscription.id),
        'listing_id': str(listing_id),
        'status': 'INACTIVE',
    }
