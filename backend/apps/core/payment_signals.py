from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.accounts.models import Profile
from apps.payments.models import ListingPayment
from apps.subscriptions.models import SubscriptionInvoice

from .domain_bookings import MoverPayout, MovingInvoice, MovingPayment
from .domain_platform import UserNotification


def _schedule_admin_moving_payment_notification(payment):
    """Add the admin-side payment-received notification without changing existing payer/mover notifications."""
    booking_id = str(payment.booking_id)
    invoice = MovingInvoice.objects.filter(pk=payment.invoice_id).first() if payment.invoice_id else MovingInvoice.objects.filter(booking_id=payment.booking_id).first()
    invoice_number = invoice.invoice_number if invoice else ""
    admins = list(Profile.objects.filter(is_active=True, is_admin=True).values_list("id", flat=True))

    def create_notifications():
        for admin_id in admins:
            UserNotification.objects.get_or_create(
                event_key=f"moving-payment-received:admin:{admin_id}:{booking_id}",
                defaults={
                    "user_id": admin_id,
                    "notification_type": "MOVING_PAYMENT_RECEIVED_ADMIN",
                    "title": "Moving payment received",
                    "message": "A renter has completed payment for a moving booking. Review the payment and mover settlement in escrow.",
                    "data": {
                        "booking_id": booking_id,
                        "payment_id": str(payment.id),
                        "invoice_id": str(invoice.id) if invoice else None,
                        "invoice_number": invoice_number,
                        "amount_kes": str(payment.amount_kes),
                        "provider": payment.provider,
                        "provider_reference": payment.provider_reference,
                        "provider_transaction_id": payment.provider_transaction_id,
                        "renter_id": str(payment.payer_id),
                    },
                },
            )

    transaction.on_commit(create_notifications)


def _schedule_moving_escrow_release_notifications(payment):
    """Notify the mover and renter once escrow is released by the admin."""
    booking_id = str(payment.booking_id)
    invoice = MovingInvoice.objects.filter(pk=payment.invoice_id).first() if payment.invoice_id else MovingInvoice.objects.filter(booking_id=payment.booking_id).first()
    from .domain_bookings import Booking
    from .domain_platform import Mover
    mover_id = Booking.objects.filter(pk=payment.booking_id).values_list("mover_id", flat=True).first()
    mover_user_id = Mover.objects.filter(pk=mover_id).values_list("user_id", flat=True).first() if mover_id else None

    def create_notifications():
        base_data = {
            "booking_id": booking_id,
            "payment_id": str(payment.id),
            "invoice_id": str(invoice.id) if invoice else None,
            "invoice_number": invoice.invoice_number if invoice else None,
            "provider": payment.provider,
            "provider_reference": payment.provider_reference,
            "provider_transaction_id": payment.provider_transaction_id,
            "released_at": payment.released_at.isoformat() if payment.released_at else None,
        }
        if payment.payer_id:
            UserNotification.objects.get_or_create(
                event_key=f"moving-escrow-released:renter:{booking_id}",
                defaults={
                    "user_id": payment.payer_id,
                    "notification_type": "MOVING_ESCROW_RELEASED_RENTER",
                    "title": "Moving payment released",
                    "message": "Your moving payment has completed its escrow lifecycle after delivery confirmation.",
                    "data": base_data,
                },
            )
        if mover_user_id:
            UserNotification.objects.get_or_create(
                event_key=f"moving-escrow-released:mover:{booking_id}",
                defaults={
                    "user_id": mover_user_id,
                    "notification_type": "MOVING_ESCROW_RELEASED_MOVER",
                    "title": "Moving payment released",
                    "message": "The escrow payment for this completed move has been released for mover settlement.",
                    "data": base_data,
                },
            )

    transaction.on_commit(create_notifications)


@receiver(post_save, sender=MovingPayment)
def schedule_moving_payment_events(sender, instance, **kwargs):
    if instance.status == "HELD":
        _schedule_admin_moving_payment_notification(instance)
        from .moving_payment_email_tasks import send_moving_payment_emails
        transaction.on_commit(lambda: send_moving_payment_emails.delay(str(instance.id)))
    elif instance.status == "RELEASED":
        from .moving_financial_services import sync_moving_financial_documents_on_release
        transaction.on_commit(lambda: sync_moving_financial_documents_on_release(payment_id=str(instance.id)))
        _schedule_moving_escrow_release_notifications(instance)


@receiver(post_save, sender=MoverPayout)
def schedule_mover_payout_processing_sync(sender, instance, **kwargs):
    """When existing escrow code moves a payout to processing, sync the settlement document."""
    if instance.final_payment_status != "processing":
        return

    payment_id = MovingPayment.objects.filter(booking_id=instance.booking_id, status="RELEASED").order_by("-released_at", "-updated_at").values_list("id", flat=True).first()
    if not payment_id:
        return

    from .moving_financial_services import sync_moving_financial_documents_on_release
    transaction.on_commit(lambda: sync_moving_financial_documents_on_release(payment_id=str(payment_id)))


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
