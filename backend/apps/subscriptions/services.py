from django.db.models import Q
from django.utils import timezone

from apps.listings.models import Listing
from .constants import FREE_LISTING_LIMIT, INDIVIDUAL_LISTING_PRICE_KES
from .models import LandlordSubscription, RealEstateSubscription, SubscriptionListing, SubscriptionPlan


def get_current_subscription(profile):
    now = timezone.now()
    if profile.role == 'landlord':
        return LandlordSubscription.objects.filter(landlord_id=profile.id).filter(
            Q(status='ACTIVE', current_period_end__gt=now)
            | Q(status='GRACE_PERIOD', grace_period_end__gt=now)
        ).order_by('-created_at').first()
    if profile.role == 'real_estate':
        return RealEstateSubscription.objects.filter(real_estate_id=profile.id).filter(
            Q(status='ACTIVE', current_period_end__gt=now)
            | Q(status='GRACE_PERIOD', grace_period_end__gt=now)
        ).order_by('-created_at').first()
    return None


def get_subscription_plan(subscription):
    if not subscription:
        return None
    return SubscriptionPlan.objects.filter(pk=subscription.plan_id).first()


def get_subscription_listing_usage(profile, subscription):
    if not subscription:
        return 0
    owned_listing_ids = Listing.objects.filter(user_id=profile.id).values('id')
    filters = {'listing_id__in': owned_listing_ids, 'status': 'ACTIVE'}
    if profile.role == 'landlord':
        filters['subscription_id'] = subscription.id
    else:
        filters['real_estate_subscription_id'] = subscription.id
    return SubscriptionListing.objects.filter(**filters).count()


def get_subscription_access(profile):
    """Return entitlement facts used by the frontend and listing service."""
    authorized = profile.role in ('landlord', 'real_estate')
    free_used = profile.free_listings_used or 0
    free_remaining = max(FREE_LISTING_LIMIT - free_used, 0)
    subscription = get_current_subscription(profile) if authorized else None
    plan = get_subscription_plan(subscription)
    used = get_subscription_listing_usage(profile, subscription)
    limit = plan.max_listings if plan else None
    remaining = None if limit is None else max(limit - used, 0)
    can_start = authorized and profile.verification_status == 'verified' and (
        profile.role != 'landlord' or profile.landlord_application_status == 'approved'
    )
    can_create = can_start and (
        free_remaining > 0 or (subscription is not None and (limit is None or remaining > 0))
    )
    return {
        'authorized': authorized,
        'role': profile.role,
        'verification_status': profile.verification_status,
        'landlord_application_status': getattr(profile, 'landlord_application_status', None),
        'free_limit': FREE_LISTING_LIMIT,
        'free_listings_used': free_used,
        'free_listings_remaining': free_remaining,
        'subscription_id': subscription.id if subscription else None,
        'plan_id': plan.id if plan else None,
        'subscription_plan': plan.name if plan else None,
        'subscription_status': subscription.status if subscription else None,
        'billing_cycle': subscription.billing_cycle if subscription else None,
        'subscription_limit': limit,
        'max_listings': limit,
        'max_units_per_listing': plan.max_units_per_listing if plan else None,
        'subscription_listings_used': used,
        'subscription_listings_remaining': remaining,
        'individual_listing_price_kes': INDIVIDUAL_LISTING_PRICE_KES,
        'can_start_listing': can_start,
        'can_create': bool(can_create),
        'requires_subscription': bool(can_start and not can_create and subscription is None),
        'requires_individual_payment': bool(can_start and not can_create),
    }
