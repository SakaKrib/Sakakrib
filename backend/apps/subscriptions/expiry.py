"""Subscription lifecycle processing migrated from production Supabase."""

from datetime import timedelta

from django.db import transaction
from django.db.models import F, Value
from django.utils import timezone

from .models import LandlordSubscription, SubscriptionListing

GRACE_PERIOD_DAYS = 5


@transaction.atomic
def process_subscription_expiry() -> dict:
    """Run the production ACTIVE -> GRACE_PERIOD -> EXPIRED lifecycle.

    The operation is idempotent and never deletes listings. A paid period that
    has ended enters a five-day grace period; only after that deadline does the
    subscription expire and its active subscription-listing allocations become
    inactive.
    """
    now = timezone.now()

    grace_count = LandlordSubscription.objects.filter(
        status="ACTIVE",
        current_period_end__lte=now,
        grace_period_end__isnull=True,
    ).update(
        status="GRACE_PERIOD",
        grace_period_end=F("current_period_end") + Value(timedelta(days=GRACE_PERIOD_DAYS)),
        updated_at=now,
    )

    expire_qs = LandlordSubscription.objects.filter(
        status="GRACE_PERIOD",
        grace_period_end__isnull=False,
        grace_period_end__lte=now,
    )
    expired_ids = list(expire_qs.values_list("id", flat=True))
    expired_count = expire_qs.update(
        status="EXPIRED",
        grace_period_end=None,
        updated_at=now,
    )

    deactivated_count = 0
    if expired_ids:
        deactivated_count = SubscriptionListing.objects.filter(
            subscription_id__in=expired_ids,
            status="ACTIVE",
        ).update(status="INACTIVE", deactivated_at=now)

    return {
        "success": True,
        "processed_at": now,
        "subscriptions_moved_to_grace": grace_count,
        "subscriptions_expired": expired_count,
        "pms_units_deactivated": deactivated_count,
    }
