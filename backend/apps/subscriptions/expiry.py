"""Subscription lifecycle processing migrated from production Supabase."""

from django.db import transaction
from django.utils import timezone

from .models import LandlordSubscription, SubscriptionListing

GRACE_PERIOD_DAYS = 5


@transaction.atomic
def process_subscription_expiry() -> dict:
    """Run the production ACTIVE -> GRACE_PERIOD -> EXPIRED lifecycle.

    This is intentionally idempotent: running it repeatedly only advances rows
    whose state and timestamps qualify. It does not delete listings.
    """
    now = timezone.now()

    grace_qs = LandlordSubscription.objects.filter(
        status="ACTIVE",
        current_period_end__lte=now,
    ).filter(
        grace_period_end__isnull=True,
    )
    grace_count = grace_qs.update(
        status="GRACE_PERIOD",
        grace_period_end=timezone.datetime.fromtimestamp(
            0, tz=timezone.get_current_timezone()
        ),
        updated_at=now,
    )

    # Set the grace deadline from the actual period end. This is kept separate
    # from the bulk state update above so the calculation cannot depend on the
    # wall clock after the query has begun.
    #
    # Rows that just entered grace have a temporary epoch deadline; replace it
    # using an expression-like per-row update without loading unrelated rows.
    for subscription in LandlordSubscription.objects.select_for_update().filter(
        status="GRACE_PERIOD", grace_period_end__lte=timezone.datetime.fromtimestamp(
            0, tz=timezone.get_current_timezone()
        )
    ):
        subscription.grace_period_end = subscription.current_period_end + timezone.timedelta(days=GRACE_PERIOD_DAYS)
        subscription.updated_at = now
        subscription.save(update_fields=["grace_period_end", "updated_at"])

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
