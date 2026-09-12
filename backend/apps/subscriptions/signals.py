from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.core.payment_events import publish_subscription_invoice_event

from .models import LandlordSubscription, RealEstateSubscription, SubscriptionInvoice


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
