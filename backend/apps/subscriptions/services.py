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
    """Backend PMS gate: ACTIVE subscription grants management access.

    Grace-period subscriptions retain read-only PMS access for continuity, but
    cannot consume additional listing capacity or perform billing/entitlement
    mutations. The caller must enforce the action-level read-only rule.
    """
    if not profile or not profile.is_authenticated:
        return {'allowed': False, 'reason': 'AUTHENTICATION_REQUIRED', 'read_only': False}
    if profile.role != 'landlord':
        return {'allowed': False, 'reason': 'LANDLORD_ROLE_REQUIRED', 'read_only': False}
    if str(getattr(profile, 'verification_status', '')).lower() != 'verified' or not getattr(profile, 'kyc_completed', False):
        return {'allowed': False, 'reason': 'IDENTITY_VERIFICATION_REQUIRED', 'read_only': False}
    if getattr(profile, 'landlord_application_status', None) != 'approved':
        return {'allowed': False, 'reason': 'LANDLORD_APPLICATION_NOT_APPROVED', 'read_only': False}
    subscription = get_current_subscription(profile)
    if not subscription:
        return {'allowed': False, 'reason': 'ACTIVE_SUBSCRIPTION_REQUIRED', 'read_only': False}
    read_only = subscription.status == 'GRACE_PERIOD'
    return {'allowed': True, 'reason': 'SUBSCRIPTION_ACTIVE' if not read_only else 'SUBSCRIPTION_GRACE_PERIOD', 'read_only': read_only, 'subscription_id': subscription.id, 'subscription_status': subscription.status}
