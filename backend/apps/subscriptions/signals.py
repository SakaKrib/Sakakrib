from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.core.notification_services import dispatch_user_notification
from apps.core.payment_events import publish_subscription_invoice_event

from .models import (
    LandlordSubscription,
    RealEstatePMSListingAssignment,
    RealEstatePMSMember,
    RealEstateSubscription,
    SubscriptionInvoice,
    SubscriptionListing,
)


@receiver(post_save, sender=SubscriptionInvoice)
def publish_subscription_invoice_created(sender, instance, created, **kwargs):
    if not created:
        return

    subscription_id = instance.landlord_subscription_id or instance.real_estate_subscription_id
    user_id = None
    subscription_status = 'PENDING_PAYMENT'

    if instance.landlord_subscription_id:
        subscription = LandlordSubscription.objects.filter(pk=instance.landlord_subscription_id).only('landlord_id', 'status').first()
        if subscription:
            user_id = subscription.landlord_id
            subscription_status = subscription.status
    elif instance.real_estate_subscription_id:
        subscription = RealEstateSubscription.objects.filter(pk=instance.real_estate_subscription_id).only('real_estate_id', 'status').first()
        if subscription:
            user_id = subscription.real_estate_id
            subscription_status = subscription.status

    if not user_id:
        return

    transaction.on_commit(lambda: publish_subscription_invoice_event(
        user_id=user_id,
        invoice_id=instance.id,
        event_type='invoice_created',
        status=instance.status or 'PENDING',
        listing_id=instance.listing_id,
        subscription_id=subscription_id,
    ))


@receiver(post_save, sender=RealEstatePMSMember)
def notify_real_estate_pms_member_change(sender, instance, created, update_fields=None, **kwargs):
    """Keep the existing user-notification stream informed of PMS team changes."""
    changed_fields = set(update_fields or [])
    if not created and not changed_fields.intersection({'role', 'status'}):
        return

    recipient = instance.user_id
    if created:
        title = 'Added to Real Estate PMS'
        message = f'You have been added to a Real Estate PMS team as {instance.role.replace("_", " ").title()}.'
        event = 'member_added'
    elif 'role' in changed_fields:
        title = 'PMS team role updated'
        message = f'Your Real Estate PMS team role is now {instance.role.replace("_", " ").title()}.'
        event = 'member_role_updated'
    elif instance.status == RealEstatePMSMember.STATUS_SUSPENDED:
        title = 'PMS team access suspended'
        message = 'Your access to the Real Estate PMS team has been suspended.'
        event = 'member_suspended'
    elif instance.status == RealEstatePMSMember.STATUS_ACTIVE:
        title = 'PMS team access restored'
        message = 'Your access to the Real Estate PMS team has been restored.'
        event = 'member_reactivated'
    else:
        return

    transaction.on_commit(lambda: dispatch_user_notification(
        user_id=recipient,
        notification_type='REAL_ESTATE_PMS_TEAM',
        title=title,
        message=message,
        data={
            'pms_owner_id': str(instance.real_estate_id),
            'member_id': str(instance.id),
            'role': instance.role,
            'status': instance.status,
            'event': event,
        },
        event_key=f'real-estate-pms:member:{instance.id}:{event}:{instance.updated_at.isoformat()}',
        send_email=False,
    ))

    if created:
        transaction.on_commit(lambda: dispatch_user_notification(
            user_id=instance.real_estate_id,
            notification_type='REAL_ESTATE_PMS_TEAM',
            title='PMS team member added',
            message='A new member has been added to your Real Estate PMS team.',
            data={
                'pms_owner_id': str(instance.real_estate_id),
                'member_id': str(instance.id),
                'member_user_id': str(instance.user_id),
                'role': instance.role,
                'event': event,
            },
            event_key=f'real-estate-pms:member-owner:{instance.id}:added:{instance.updated_at.isoformat()}',
            send_email=False,
        ))


@receiver(post_save, sender=RealEstatePMSListingAssignment)
def notify_real_estate_pms_listing_assignment(sender, instance, created, update_fields=None, **kwargs):
    """Notify the assigned agent and PMS administrator when assignment state changes."""
    changed_fields = set(update_fields or [])
    if not created and 'is_active' not in changed_fields:
        return

    if created or instance.is_active:
        event = 'listing_assigned'
        title = 'Listing assigned'
        agent_message = 'A listing has been assigned to you in the Real Estate PMS.'
        owner_message = 'A listing has been assigned to a PMS team member.'
    else:
        event = 'listing_unassigned'
        title = 'Listing assignment removed'
        agent_message = 'A Real Estate PMS listing assignment has been removed from your account.'
        owner_message = 'A Real Estate PMS listing assignment has been removed.'

    base_data = {
        'pms_owner_id': str(instance.real_estate_id),
        'assignment_id': str(instance.id),
        'listing_id': str(instance.listing_id),
        'agent_id': str(instance.agent_id),
        'is_active': instance.is_active,
        'event': event,
    }

    transaction.on_commit(lambda: dispatch_user_notification(
        user_id=instance.agent_id,
        notification_type='REAL_ESTATE_PMS_LISTING',
        title=title,
        message=agent_message,
        data=base_data,
        event_key=f'real-estate-pms:assignment:agent:{instance.id}:{event}:{instance.updated_at.isoformat()}',
        send_email=False,
    ))

    transaction.on_commit(lambda: dispatch_user_notification(
        user_id=instance.real_estate_id,
        notification_type='REAL_ESTATE_PMS_LISTING',
        title=title,
        message=owner_message,
        data=base_data,
        event_key=f'real-estate-pms:assignment:owner:{instance.id}:{event}:{instance.updated_at.isoformat()}',
        send_email=False,
    ))


@receiver(post_save, sender=SubscriptionInvoice)
def notify_subscription_payment_received(sender, instance, **kwargs):
    """Push + in-app alert to the account owner when a subscription invoice is paid."""
    if str(instance.status or '').upper() != 'PAID':
        return

    user_id = None
    kind = 'subscription'
    if instance.landlord_subscription_id:
        row = LandlordSubscription.objects.filter(pk=instance.landlord_subscription_id).only('landlord_id').first()
        user_id = getattr(row, 'landlord_id', None)
    elif instance.real_estate_subscription_id:
        row = RealEstateSubscription.objects.filter(pk=instance.real_estate_subscription_id).only('real_estate_id').first()
        user_id = getattr(row, 'real_estate_id', None)
        kind = 'real estate subscription'
    if not user_id:
        return

    try:
        amount = f"KES {int(instance.amount_kes):,}"
    except (TypeError, ValueError):
        amount = 'Your payment'
    data = {
        'invoice_id': str(instance.id),
        'subscription_id': str(instance.landlord_subscription_id or instance.real_estate_subscription_id or ''),
        'amount_kes': str(instance.amount_kes),
        'provider': str(instance.payment_provider or ''),
        'action_type': 'SUBSCRIPTION_PAID',
        'deep_link': 'pms-dashboard',
    }
    transaction.on_commit(lambda: dispatch_user_notification(
        user_id=user_id,
        notification_type='SUBSCRIPTION_PAYMENT_RECEIVED',
        title='Payment received',
        message=f'{amount} received for your {kind}. Your property management tools are active.',
        data=data,
        event_key=f'subscription-paid:{instance.id}',
        send_email=False,
    ))


def _restore_pms_links(subscription, *, owner_id, link_field):
    """Re-attach managed properties that were deactivated when a subscription lapsed.

    Nothing is deleted on expiry (units, renters, invoices stay in the database); only the
    SubscriptionListing links are switched to INACTIVE. On renewal we switch them back, up to
    the plan's listing capacity, so the owner resumes exactly where they left off.
    """
    from django.utils import timezone
    from apps.listings.models import Listing
    from .services import get_subscription_plan

    plan = get_subscription_plan(subscription)
    capacity = getattr(plan, "max_listings", None)
    owned_ids = list(Listing.objects.filter(user_id=owner_id, is_property_management=True).values_list("id", flat=True))
    if not owned_ids:
        return
    active_ids = set(SubscriptionListing.objects.filter(**{link_field: subscription.id}, status="ACTIVE", listing_id__in=owned_ids).values_list("listing_id", flat=True))
    remaining = None if capacity is None else max(0, capacity - len(active_ids))
    # Only links that went inactive because a subscription lapsed; a listing the owner detached by
    # hand (while the subscription was still live) stays detached.
    lapsed_ids = list(type(subscription).objects.filter(**{("landlord_id" if link_field == "subscription_id" else "real_estate_id"): owner_id}).exclude(status__in=["ACTIVE", "GRACE_PERIOD", "PENDING_PAYMENT"]).values_list("id", flat=True)) + [subscription.id]
    stale = SubscriptionListing.objects.filter(status="INACTIVE", listing_id__in=owned_ids, **{f"{link_field}__in": lapsed_ids}).exclude(listing_id__in=active_ids).order_by("activated_at")
    now = timezone.now()
    seen = set()
    for link in stale:
        if remaining is not None and remaining <= 0:
            break
        if link.listing_id in seen:
            continue
        seen.add(link.listing_id)
        existing = SubscriptionListing.objects.filter(**{link_field: subscription.id, "listing_id": link.listing_id}).first()
        if existing:
            existing.status = "ACTIVE"
            existing.deactivated_at = None
            existing.save(update_fields=["status", "deactivated_at"])
        else:
            setattr(link, link_field, subscription.id)
            link.status = "ACTIVE"
            link.deactivated_at = None
            link.activated_at = now
            link.save()
        if remaining is not None:
            remaining -= 1


@receiver(post_save, sender=LandlordSubscription)
def restore_landlord_pms_after_renewal(sender, instance, **kwargs):
    if instance.status == "ACTIVE":
        _restore_pms_links(instance, owner_id=instance.landlord_id, link_field="subscription_id")


@receiver(post_save, sender=RealEstateSubscription)
def restore_real_estate_pms_after_renewal(sender, instance, **kwargs):
    if instance.status == "ACTIVE":
        _restore_pms_links(instance, owner_id=instance.real_estate_id, link_field="real_estate_subscription_id")
