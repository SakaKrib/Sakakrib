from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.accounts.models import Profile
from apps.subscriptions.models import (
    LandlordSubscription,
    RealEstateSubscription,
    SubscriptionListing,
)
from .models import Listing, ListingPaymentIntent

FREE_LIMIT = 3
INDIVIDUAL_LISTING_PRICE_KES = 1000


def _current_subscription(profile):
    now = timezone.now()
    if profile.role == 'landlord':
        qs = LandlordSubscription.objects.filter(
            landlord_id=profile.id,
        ).filter(
            status='ACTIVE', current_period_end__gt=now,
        ) | LandlordSubscription.objects.filter(
            landlord_id=profile.id, status='GRACE_PERIOD', grace_period_end__gt=now,
        )
    else:
        qs = RealEstateSubscription.objects.filter(
            real_estate_id=profile.id,
        ).filter(
            status='ACTIVE', current_period_end__gt=now,
        ) | RealEstateSubscription.objects.filter(
            real_estate_id=profile.id, status='GRACE_PERIOD', grace_period_end__gt=now,
        )
    return qs.order_by('-created_at').first()


def _subscription_usage(subscription, role, user_id):
    if role == 'landlord':
        return SubscriptionListing.objects.filter(
            subscription_id=subscription.id, status='ACTIVE'
        ).filter(listing_id__in=Listing.objects.filter(user_id=user_id).values('id')).count()
    return SubscriptionListing.objects.filter(
        real_estate_subscription_id=subscription.id, status='ACTIVE'
    ).filter(listing_id__in=Listing.objects.filter(user_id=user_id).values('id')).count()


def get_listing_entitlement(profile):
    if profile.role not in ('landlord', 'real_estate'):
        return {'authorized': False, 'can_create': False, 'reason': 'INVALID_ROLE'}
    can_start = profile.verification_status == 'verified' and (
        profile.role != 'landlord' or profile.landlord_application_status == 'approved'
    )
    free_used = profile.free_listings_used or 0
    free_remaining = max(FREE_LIMIT - free_used, 0)
    subscription = _current_subscription(profile)
    used = 0
    remaining = None
    if subscription:
        plan = subscription.plan_id
        # SubscriptionPlan is intentionally queried lazily by the API layer so
        # this service remains usable while the legacy schema is authoritative.
        from apps.subscriptions.models import SubscriptionPlan
        plan_obj = SubscriptionPlan.objects.get(pk=plan)
        limit = plan_obj.max_listings
        used = _subscription_usage(subscription, profile.role, profile.id)
        remaining = None if limit is None else max(limit - used, 0)
    else:
        plan_obj = None
        limit = None

    can_create = can_start and (free_remaining > 0 or (subscription and (limit is None or remaining > 0)))
    requires_individual = can_start and not can_create
    requires_subscription = requires_individual and subscription is None
    return {
        'authorized': True,
        'role': profile.role,
        'can_start_listing': can_start,
        'can_create': can_create,
        'free_limit': FREE_LIMIT,
        'free_listings_used': free_used,
        'free_listings_remaining': free_remaining,
        'subscription_id': subscription.id if subscription else None,
        'subscription_plan': getattr(plan_obj, 'name', None),
        'subscription_status': subscription.status if subscription else None,
        'subscription_limit': limit,
        'subscription_listings_used': used,
        'subscription_listings_remaining': remaining,
        'requires_subscription': requires_subscription,
        'requires_individual_payment': requires_individual,
        'individual_listing_price_kes': INDIVIDUAL_LISTING_PRICE_KES,
    }


@transaction.atomic
def create_listing(profile, data):
    profile = Profile.objects.select_for_update().get(pk=profile.id)
    entitlement = get_listing_entitlement(profile)
    if not entitlement.get('can_start_listing'):
        raise ValidationError('Identity verification and, for landlords, application approval are required before creating a listing.')
    if not entitlement.get('can_create'):
        return {'success': False, 'listing_created': False, **entitlement}

    listing = Listing.objects.create(
        user_id=profile.id,
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
        contact_phone=data.get('contact_phone'),
        contact_email=data.get('contact_email'),
        social_links=data.get('social_links', []),
        booking_enabled=data.get('booking_enabled', False),
        payment_enabled=data.get('payment_enabled', False),
        is_property_management=data.get('is_property_management', False),
        is_paid=True,
        is_published=False,
        approval_status='pending_review',
        is_approved=False,
        status='pending',
    )
    if profile.role == 'landlord' and data.get('is_property_management') and not entitlement.get('subscription_id'):
        raise ValidationError('PMS subscription required for property management listings.')

    if entitlement['free_listings_remaining'] > 0:
        Profile.objects.filter(pk=profile.id).update(free_listings_used=profile.free_listings_used + 1)
        listing_entitlement = 'FREE'
    else:
        SubscriptionListing.objects.create(
            subscription_id=entitlement['subscription_id'] if profile.role == 'landlord' else None,
            real_estate_subscription_id=entitlement['subscription_id'] if profile.role == 'real_estate' else None,
            listing_id=listing.id,
            status='ACTIVE',
            activated_at=timezone.now(),
        )
        listing_entitlement = 'SUBSCRIPTION'
    return {'success': True, 'listing_created': True, 'listing_id': listing.id,
            'listing_entitlement': listing_entitlement, 'payment_required': False,
            'is_published': False, 'approval_status': 'pending_review'}


@transaction.atomic
def create_listing_payment_intent(profile, listing_data):
    entitlement = get_listing_entitlement(profile)
    if not entitlement.get('can_start_listing'):
        raise ValidationError('Identity verification and, for landlords, application approval are required before payment.')
    if entitlement.get('can_create'):
        raise ValidationError('A free or subscription listing entitlement is available.')
    ListingPaymentIntent.objects.filter(user_id=profile.id, status='PENDING').update(
        status='CANCELLED', updated_at=timezone.now()
    )
    intent = ListingPaymentIntent.objects.create(
        user_id=profile.id, role=profile.role, amount_kes=INDIVIDUAL_LISTING_PRICE_KES,
        status='PENDING', listing_data=listing_data,
    )
    return {'success': True, 'payment_intent_created': True, 'listing_created': False,
            'payment_intent_id': intent.id, 'amount_kes': INDIVIDUAL_LISTING_PRICE_KES,
            'status': 'PENDING'}
