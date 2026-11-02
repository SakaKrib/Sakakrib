from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.core.domain_bookings import Booking, MoverPayout
from apps.core.domain_platform import Mover, MoverApplication, RenterNotification, UserNotification
from apps.core.domain_property import RenterUnitAssociation
from apps.core.domain_rent import RentInvoice, RentPayment, RentPaymentSubmission
from apps.listings.models import Listing
from apps.payments.models import ListingPayment

from .realtime_events import schedule_user_event


def _send(user_ids, *, resource, instance, created, status=None):
    action = "created" if created else "updated"
    for user_id in {str(value) for value in user_ids if value}:
        schedule_user_event(
            user_id,
            resource=resource,
            object_id=instance.pk,
            action=action,
            status=status,
        )


@receiver(post_save, sender=UserNotification)
def live_user_notification(sender, instance, created, **kwargs):
    _send([instance.user_id], resource="notifications", instance=instance, created=created)


@receiver(post_save, sender=RenterNotification)
def live_renter_notification(sender, instance, created, **kwargs):
    _send(
        [instance.renter_user_id, instance.landlord_id],
        resource="notifications",
        instance=instance,
        created=created,
    )


@receiver(post_save, sender=Booking)
def live_booking(sender, instance, created, **kwargs):
    mover_user_id = Mover.objects.filter(pk=instance.mover_id).values_list("user_id", flat=True).first()
    _send(
        [instance.renter_id, mover_user_id],
        resource="bookings",
        instance=instance,
        created=created,
        status=instance.status,
    )


@receiver(post_save, sender=MoverPayout)
def live_mover_payout(sender, instance, created, **kwargs):
    mover_user_id = Mover.objects.filter(pk=instance.mover_id).values_list("user_id", flat=True).first()
    _send(
        [mover_user_id],
        resource="payouts",
        instance=instance,
        created=created,
        status=instance.final_payment_status,
    )


@receiver(post_save, sender=RentInvoice)
def live_rent_invoice(sender, instance, created, **kwargs):
    _send(
        [instance.landlord_id, instance.renter_user_id],
        resource="rent",
        instance=instance,
        created=created,
        status=instance.status,
    )


@receiver(post_save, sender=RentPaymentSubmission)
def live_rent_payment_submission(sender, instance, created, **kwargs):
    _send(
        [instance.landlord_id, instance.renter_user_id],
        resource="rent",
        instance=instance,
        created=created,
        status=instance.status,
    )


@receiver(post_save, sender=RentPayment)
def live_rent_payment(sender, instance, created, **kwargs):
    renter_user_id = RenterUnitAssociation.objects.filter(
        pk=instance.renter_assoc_id
    ).values_list("renter_user_id", flat=True).first()
    _send(
        [instance.landlord_id, renter_user_id],
        resource="rent",
        instance=instance,
        created=created,
        status=instance.status,
    )


@receiver(post_save, sender=Listing)
def live_listing(sender, instance, created, **kwargs):
    _send(
        [instance.user_id],
        resource="listings",
        instance=instance,
        created=created,
        status=instance.approval_status,
    )


@receiver(post_save, sender=ListingPayment)
def live_listing_payment(sender, instance, created, **kwargs):
    _send(
        [instance.user_id],
        resource="payments",
        instance=instance,
        created=created,
        status=instance.status,
    )


@receiver(post_save, sender=MoverApplication)
def live_mover_application(sender, instance, created, **kwargs):
    _send(
        [instance.applicant_id],
        resource="applications",
        instance=instance,
        created=created,
        status=instance.status,
    )
