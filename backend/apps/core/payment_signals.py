from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.accounts.models import Profile
from apps.payments.models import ListingPayment
from apps.subscriptions.models import SubscriptionInvoice

from .domain_bookings import MovingInvoice, MovingPayment
from .domain_platform import UserNotification


def _schedule_admin_moving_payment_notification(payment):
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


def _schedule_moving_payout_processing_notifications(payment):
    """Notify participants that escrow is authorized and payout is processing.

    Payment RELEASED means escrow was authorized; the mover is not paid until
    the payout provider confirms the transfer.
    """
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
            "status": "PAYOUT_PROCESSING",
        }
        if payment.payer_id:
            UserNotification.objects.get_or_create(
                event_key=f"moving-payout-processing:renter:{booking_id}",
                defaults={
                    "user_id": payment.payer_id,
                    "notification_type": "MOVING_PAYOUT_PROCESSING_RENTER",
                    "title": "Moving escrow released",
                    "message": "Your moving payment has been released from escrow and the mover payout is now being processed.",
                    "data": base_data,
                },
            )
        if mover_user_id:
            UserNotification.objects.get_or_create(
                event_key=f"moving-payout-processing:mover:{booking_id}",
                defaults={
                    "user_id": mover_user_id,
                    "notification_type": "MOVING_PAYOUT_PROCESSING_MOVER",
                    "title": "Mover payout processing",
                    "message": "Escrow has been authorized for release. Your mover payout is now being processed by the payment provider.",
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
        _schedule_moving_payout_processing_notifications(instance)


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
