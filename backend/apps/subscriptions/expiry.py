"""Subscription lifecycle processing owned by Django."""

from datetime import timedelta

from django.db import transaction
from django.db.models import F, Value
from django.utils import timezone

from .models import LandlordSubscription, RealEstateSubscription, SubscriptionListing

GRACE_PERIOD_DAYS = 5


def _process_model(model, owner_field, subscription_listing_field, now):
    grace_count = model.objects.filter(status='ACTIVE', current_period_end__lte=now, grace_period_end__isnull=True).update(
        status='GRACE_PERIOD', grace_period_end=F('current_period_end') + Value(timedelta(days=GRACE_PERIOD_DAYS)), updated_at=now)
    expire_qs = model.objects.filter(status='GRACE_PERIOD', grace_period_end__isnull=False, grace_period_end__lte=now)
    expired_ids = list(expire_qs.values_list('id', flat=True))
    expired_count = expire_qs.update(status='EXPIRED', grace_period_end=None, updated_at=now)
    deactivated = 0
    if expired_ids:
        deactivated = SubscriptionListing.objects.filter(**{f'{subscription_listing_field}__in': expired_ids}, status='ACTIVE').update(status='INACTIVE', deactivated_at=now)
    return grace_count, expired_count, deactivated


@transaction.atomic
def process_subscription_expiry() -> dict:
    """Idempotently move ended subscriptions through five-day grace to expiry."""
    now = timezone.now()
    landlord = _process_model(LandlordSubscription, 'landlord_id', 'subscription_id', now)
    real_estate = _process_model(RealEstateSubscription, 'real_estate_id', 'real_estate_subscription_id', now)
    return {
        'success': True, 'processed_at': now,
        'landlord_subscriptions_moved_to_grace': landlord[0], 'landlord_subscriptions_expired': landlord[1],
        'real_estate_subscriptions_moved_to_grace': real_estate[0], 'real_estate_subscriptions_expired': real_estate[1],
        'pms_listings_deactivated': landlord[2] + real_estate[2],
    }
