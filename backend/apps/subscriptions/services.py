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


def get_my_pms_listings(profile):
    subscription = get_current_subscription(profile)
    if not subscription:
        return []
    key = _pms_listing_key(profile)
    links = SubscriptionListing.objects.filter(**{key: subscription.id}, status='ACTIVE')
    listing_ids = links.values_list('listing_id', flat=True)
    listings = Listing.objects.filter(id__in=listing_ids, user_id=profile.id).order_by('-updated_at', '-created_at')
    link_by_listing = {str(link.listing_id): link for link in links}
    return [
        {
            'id': str(listing.id),
            'title': listing.title,
            'city': listing.city,
            'county': listing.county,
            'price_kes': listing.price_kes,
            'is_published': listing.is_published,
            'status': listing.status,
            'activated_at': link_by_listing[str(listing.id)].activated_at,
            'deactivated_at': link_by_listing[str(listing.id)].deactivated_at,
        }
        for listing in listings
    ]


def get_available_pms_listings(profile):
    subscription = get_current_subscription(profile)
    if not subscription:
        return []
    key = _pms_listing_key(profile)
    linked_ids = SubscriptionListing.objects.filter(**{key: subscription.id}, status='ACTIVE').values('listing_id')
    listings = Listing.objects.filter(user_id=profile.id, is_property_management=True).exclude(id__in=linked_ids).order_by('-updated_at', '-created_at')
    return [
        {
            'id': str(listing.id),
            'title': listing.title,
            'city': listing.city,
            'county': listing.county,
            'price_kes': listing.price_kes,
            'is_published': listing.is_published,
            'status': listing.status,
        }
        for listing in listings
    ]


def get_pms_unit_count(profile):
    subscription = get_current_subscription(profile)
    if not subscription:
        return {'unit_count': 0, 'max_units': None, 'remaining_units': None}
    plan = get_subscription_plan(subscription)
    max_units = plan.max_units_per_listing if plan else None
    listing_ids = SubscriptionListing.objects.filter(
        **{_pms_listing_key(profile): subscription.id}, status='ACTIVE'
    ).values_list('listing_id', flat=True)
    from apps.core.domain_property import PropertyUnit
    unit_count = PropertyUnit.objects.filter(listing_id__in=listing_ids).count()
    return {
        'unit_count': unit_count,
        'max_units': max_units,
        'remaining_units': None if max_units is None else max(0, max_units - unit_count),
    }


def add_listing_to_pms(profile, listing_id):
    access = get_pms_access(profile)
    if not access.get('allowed'):
        raise ValueError(access.get('reason', 'PMS access denied.'))
    if access.get('read_only'):
        raise ValueError('PMS is read-only during the grace period.')
    subscription = get_current_subscription(profile)
    plan = get_subscription_plan(subscription)
    if not subscription or not plan:
        raise ValueError('Active PMS subscription not found.')
    try:
        listing = Listing.objects.get(pk=listing_id, user_id=profile.id, is_property_management=True)
    except Listing.DoesNotExist as exc:
        raise ValueError('Property-management listing not found or not owned by you.') from exc
    key = _pms_listing_key(profile)
    with transaction.atomic():
        if SubscriptionListing.objects.filter(**{key: subscription.id, 'listing_id': listing.id, 'status': 'ACTIVE'}).exists():
            raise ValueError('Listing is already in PMS.')
        active_count = SubscriptionListing.objects.filter(**{key: subscription.id}, status='ACTIVE').count()
        if plan.max_listings is not None and active_count >= plan.max_listings:
            raise ValueError('Your PMS subscription listing limit has been reached.')
        values = {
            key: subscription.id,
            'listing_id': listing.id,
            'status': 'ACTIVE',
            'activated_at': timezone.now(),
            'created_at': timezone.now(),
        }
        link = SubscriptionListing.objects.create(**values)
    return {'success': True, 'listing_id': str(listing.id), 'subscription_id': str(subscription.id), 'subscription_listing_id': str(link.id)}


def remove_listing_from_pms(profile, listing_id):
    access = get_pms_access(profile)
    if not access.get('allowed'):
        raise ValueError(access.get('reason', 'PMS access denied.'))
    if access.get('read_only'):
        raise ValueError('PMS is read-only during the grace period.')
    subscription = get_current_subscription(profile)
    if not subscription:
        raise ValueError('Active PMS subscription not found.')
    key = _pms_listing_key(profile)
    with transaction.atomic():
        link = SubscriptionListing.objects.filter(**{key: subscription.id}, listing_id=listing_id, status='ACTIVE').first()
        if not link:
            raise ValueError('PMS listing not found.')
        if not Listing.objects.filter(pk=listing_id, user_id=profile.id).exists():
            raise ValueError('Listing not found or not owned by you.')
        link.status = 'INACTIVE'
        link.deactivated_at = timezone.now()
        link.save(update_fields=['status', 'deactivated_at'])
    return {'success': True, 'listing_id': str(listing_id), 'subscription_id': str(subscription.id)}
