from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.payments.models import ListingPayment
from apps.subscriptions.models import SubscriptionInvoice


@receiver(post_save, sender=SubscriptionInvoice)
def schedule_subscription_payment_receipt(sender, instance, **kwargs):
    if instance.status != 'PAID':
        return

    provider = str(instance.payment_provider or '').upper()
    if provider not in {'PAYPAL', 'MPESA'}:
        return

    from .payment_email_tasks import send_payment_success_email

    transaction.on_commit(lambda: send_payment_success_email.delay(str(instance.id), provider))


@receiver(post_save, sender=ListingPayment)
def schedule_listing_payment_receipt(sender, instance, **kwargs):
    if instance.status != 'PAID':
        return

    provider = str(instance.payment_provider or '').upper()
    if provider not in {'PAYPAL', 'MPESA'}:
        return

    from .listing_payment_email_tasks import send_listing_payment_success_email

    transaction.on_commit(lambda: send_listing_payment_success_email.delay(str(instance.id)))
