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
