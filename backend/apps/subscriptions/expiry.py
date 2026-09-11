"""Subscription lifecycle processing owned by Django."""

from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from .models import LandlordSubscription, RealEstateSubscription, SubscriptionListing

GRACE_PERIOD_DAYS = 5


def _queue_lifecycle_notification(*, subscription, owner_id, status, grace_period_end=None):
    """Queue a durable lifecycle notification after the state transition commits."""
    if status == 'GRACE_PERIOD':
        notification_type = 'SUBSCRIPTION_GRACE_PERIOD'
        title = 'Subscription in grace period'
        message = 'Your Saka Krib subscription has entered its five-day grace period. Please renew before access is restricted.'
        template_type = 'subscription_grace_period'
    elif status == 'EXPIRED':
        notification_type = 'SUBSCRIPTION_EXPIRED'
        title = 'Subscription expired'
        message = 'Your Saka Krib subscription has expired because the grace period ended without a confirmed renewal payment.'
        template_type = 'subscription_expired'
    else:
        return

    event_key = f'subscription-lifecycle:{subscription.id}:{status}:{grace_period_end or ""}'
    data = {
        'subscription_id': str(subscription.id),
        'plan_id': str(subscription.plan_id),
        'billing_cycle': subscription.billing_cycle,
        'subscription_status': status,
        'billing_amount_kes': str(subscription.billing_amount_kes) if subscription.billing_amount_kes is not None else None,
        'billing_amount_usd': str(subscription.billing_amount_usd) if subscription.billing_amount_usd is not None else None,
        'current_period_start': subscription.current_period_start.isoformat() if subscription.current_period_start else None,
        'current_period_end': subscription.current_period_end.isoformat() if subscription.current_period_end else None,
        'grace_period_end': grace_period_end.isoformat() if grace_period_end else None,
    }

    from apps.core.notification_services import dispatch_user_notification

    dispatch_user_notification(
        user_id=owner_id,
        notification_type=notification_type,
        title=title,
        message=message,
        data=data,
        event_key=event_key,
        send_email=True,
        email_template=template_type,
    )


def _process_model(model, owner_field, subscription_listing_field, now):
    """Lock each lifecycle candidate before changing its state.

    Payment/renewal settlement can legitimately run at the same time as the
    expiry task. Locking the candidate rows prevents a stale expiry decision
    from overwriting a subscription that has just been renewed or otherwise
    transitioned by another transaction.
    """
    grace_candidates = list(
        model.objects.select_for_update().filter(
            status='ACTIVE',
            current_period_end__lte=now,
            grace_period_end__isnull=True,
        )
    )

    grace_notifications = []
    for subscription in grace_candidates:
        grace_end = subscription.current_period_end + timedelta(days=GRACE_PERIOD_DAYS)
        subscription.status = 'GRACE_PERIOD'
        subscription.grace_period_end = grace_end
        subscription.updated_at = now
        subscription.save(update_fields=['status', 'grace_period_end', 'updated_at'])
        grace_notifications.append((subscription, grace_end))

    expire_candidates = list(
        model.objects.select_for_update().filter(
            status='GRACE_PERIOD',
            grace_period_end__isnull=False,
            grace_period_end__lte=now,
        )
    )

    expired_count = 0
    expired_notifications = []
    expired_ids = []
    for subscription in expire_candidates:
        grace_end = subscription.grace_period_end
        subscription.status = 'EXPIRED'
        subscription.grace_period_end = None
        subscription.updated_at = now
        subscription.save(update_fields=['status', 'grace_period_end', 'updated_at'])
        expired_count += 1
        expired_ids.append(subscription.id)
        expired_notifications.append((subscription, grace_end))

    deactivated = 0
    if expired_ids:
        deactivated = SubscriptionListing.objects.filter(
            **{f'{subscription_listing_field}__in': expired_ids},
            status='ACTIVE',
        ).update(status='INACTIVE', deactivated_at=now)

    return len(grace_notifications), expired_count, deactivated, grace_notifications, expired_notifications


@transaction.atomic
def process_subscription_expiry() -> dict:
    """Idempotently move ended subscriptions through five-day grace to expiry."""
    now = timezone.now()
    landlord = _process_model(LandlordSubscription, 'landlord_id', 'subscription_id', now)
    real_estate = _process_model(RealEstateSubscription, 'real_estate_id', 'real_estate_subscription_id', now)

    for subscription, grace_end in landlord[3]:
        transaction.on_commit(lambda subscription=subscription, grace_end=grace_end: _queue_lifecycle_notification(
            subscription=subscription, owner_id=subscription.landlord_id, status='GRACE_PERIOD', grace_period_end=grace_end,
        ))
    for subscription, grace_end in landlord[4]:
        transaction.on_commit(lambda subscription=subscription, grace_end=grace_end: _queue_lifecycle_notification(
            subscription=subscription, owner_id=subscription.landlord_id, status='EXPIRED', grace_period_end=grace_end,
        ))
    for subscription, grace_end in real_estate[3]:
        transaction.on_commit(lambda subscription=subscription, grace_end=grace_end: _queue_lifecycle_notification(
            subscription=subscription, owner_id=subscription.real_estate_id, status='GRACE_PERIOD', grace_period_end=grace_end,
        ))
    for subscription, grace_end in real_estate[4]:
        transaction.on_commit(lambda subscription=subscription, grace_end=grace_end: _queue_lifecycle_notification(
            subscription=subscription, owner_id=subscription.real_estate_id, status='EXPIRED', grace_period_end=grace_end,
        ))

    return {
        'success': True, 'processed_at': now,
        'landlord_subscriptions_moved_to_grace': landlord[0], 'landlord_subscriptions_expired': landlord[1],
        'real_estate_subscriptions_moved_to_grace': real_estate[0], 'real_estate_subscriptions_expired': real_estate[1],
        'pms_listings_deactivated': landlord[2] + real_estate[2],
    }
