from django.db import transaction
from django.db.models import Q
from django.db.models.signals import post_delete, post_save, pre_save
from django.dispatch import receiver

from apps.core.domain_bookings import (
    Booking, ChatMessage, MovingCancellationEvent, MovingDispute, MovingInvoice,
    MovingPayment, MoverPayout, MoverScheduleEvent,
)
from apps.core.domain_financial import MovingFinancialDocument
from apps.core.domain_journeys import MovingJourney
from apps.core.domain_platform import Mover, MoverApplication, RenterNotification, UserNotification, SupportTicket
from apps.core.domain_property import (
    CommunityPost, CommunityPostMedia, CommunityPostReaction,
    LandlordPaymentMethod, ListingMedia, PMSSubscriptionNotification,
    PropertyUnit, RenterUnitAssociation, Review,
)
from apps.core.domain_rent import RentInvoice, RentPayment, RentPaymentSubmission, RentReminder, RentReminderSetting
from apps.listings.models import Listing
from apps.payments.models import ListingPayment
from apps.subscriptions.models import (
    LandlordSubscription, RealEstatePMSListingAssignment, RealEstatePMSMember,
    RealEstatePMSSettings, RealEstateSubscription, SubscriptionInvoice,
    SubscriptionListing,
)
from apps.accounts.models import Profile

from .realtime_events import (
    schedule_admin_event, schedule_chat_message_event, schedule_community_event,
    schedule_marketplace_event, schedule_user_event,
)


def _send(
    user_ids, *, resource, instance, created, status=None,
    notify_admin=False, action_override=None, object_id=None,
):
    action = action_override or ("created" if created else "updated")
    event_object_id = instance.pk if object_id is None else object_id
    if resource == "community":
        schedule_community_event(
            object_id=event_object_id,
            action=action,
            status=status,
        )
        return
    for user_id in {str(value) for value in user_ids if value}:
        schedule_user_event(
            user_id,
            resource=resource,
            object_id=event_object_id,
            action=action,
            status=status,
        )
    if notify_admin and Profile.objects.filter(is_active=True).filter(
        Q(is_admin=True) | Q(is_staff=True) | Q(is_superuser=True) | Q(role='admin')
    ).exists():
        schedule_admin_event(resource=resource, object_id=event_object_id, action=action, status=status)


@receiver(post_save, sender=UserNotification)
def live_user_notification(sender, instance, created, **kwargs):
    _send([instance.user_id], resource="notifications", instance=instance, created=created)
    if created:
        from .push_notifications import send_user_notification_push
        transaction.on_commit(lambda: send_user_notification_push(
            user_id=instance.user_id,
            notification_id=instance.id,
            notification_type=instance.notification_type,
            title=instance.title,
            body=instance.message,
            data=instance.data,
        ))


@receiver(post_save, sender=RenterNotification)
def live_renter_notification(sender, instance, created, **kwargs):
    _send(
        [instance.renter_user_id, instance.landlord_id],
        resource="notifications",
        instance=instance,
        created=created,
    )
    if created:
        from .push_notifications import send_renter_notification_push
        transaction.on_commit(lambda: send_renter_notification_push(notification=instance))


@receiver(post_save, sender=ChatMessage)
def live_chat_message(sender, instance, created, **kwargs):
    _send(
        [instance.sender_id, instance.receiver_id],
        resource="chat",
        instance=instance,
        created=created,
        status=instance.message_type,
    )
    if not created:
        return

    # Centralize chat alerts here so every ChatMessage creation path is covered,
    # including booking workflows that do not call chat_services.send_message().
    schedule_chat_message_event(instance.id)

    if instance.message_type == "system":
        return

    sender_profile = Profile.objects.filter(pk=instance.sender_id).only("role").first()
    notification_data = {
        "conversation_id": instance.conversation_id,
        "message_id": str(instance.id),
        "message_type": instance.message_type,
        "sender_id": str(instance.sender_id),
    }
    if sender_profile and sender_profile.role == "renter":
        notification_data["renter_user_id"] = str(instance.sender_id)
    elif sender_profile and sender_profile.role == "mover":
        mover_profile_id = Mover.objects.filter(
            user_id=instance.sender_id,
            approval_status="approved",
        ).values_list("id", flat=True).first()
        if mover_profile_id:
            notification_data["mover_id"] = str(mover_profile_id)

    from .notification_services import dispatch_user_notification

    dispatch_user_notification(
        user_id=instance.receiver_id,
        notification_type="CHAT_MESSAGE",
        title="New message",
        message=(instance.content or "")[:160] or "You received a message.",
        data=notification_data,
        event_key=f"chat:{instance.id}",
        send_email=False,
    )


@receiver(post_save, sender=Booking)
def live_booking(sender, instance, created, **kwargs):
    update_fields = kwargs.get("update_fields")
    gps_only_fields = {
        "last_known_latitude", "last_known_longitude", "last_location_at", "updated_at",
    }
    if not created and update_fields and set(update_fields).issubset(gps_only_fields):
        # Location frames have their own tracking socket; avoid refreshing whole dashboards.
        return
    mover_user_id = Mover.objects.filter(pk=instance.mover_id).values_list("user_id", flat=True).first()
    _send(
        [instance.renter_id, mover_user_id],
        resource="bookings",
        instance=instance,
        created=created,
        status=instance.status,
        notify_admin=True,
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
        notify_admin=True,
    )


@receiver(post_save, sender=MovingInvoice)
def live_moving_invoice(sender, instance, created, **kwargs):
    mover_user_id = Mover.objects.filter(pk=instance.mover_id).values_list("user_id", flat=True).first()
    _send(
        [instance.renter_id, mover_user_id],
        resource="payments",
        instance=instance,
        created=created,
        status=instance.status,
        notify_admin=True,
    )


@receiver(post_save, sender=MovingPayment)
def live_moving_payment(sender, instance, created, **kwargs):
    booking = Booking.objects.filter(pk=instance.booking_id).first()
    mover_user_id = Mover.objects.filter(pk=booking.mover_id).values_list("user_id", flat=True).first() if booking else None
    _send(
        [instance.payer_id, mover_user_id],
        resource="payments",
        instance=instance,
        created=created,
        status=instance.status,
        notify_admin=True,
    )


@receiver(post_save, sender=MoverScheduleEvent)
def live_mover_schedule(sender, instance, created, **kwargs):
    mover_user_id = Mover.objects.filter(pk=instance.mover_id).values_list("user_id", flat=True).first()
    _send(
        [mover_user_id],
        resource="schedules",
        instance=instance,
        created=created,
        status=instance.status,
    )


@receiver(post_save, sender=MovingDispute)
def live_moving_dispute(sender, instance, created, **kwargs):
    booking = Booking.objects.filter(pk=instance.booking_id).first()
    mover_user_id = Mover.objects.filter(pk=booking.mover_id).values_list("user_id", flat=True).first() if booking else None
    _send(
        [instance.opened_by, instance.resolved_by, booking.renter_id if booking else None, mover_user_id],
        resource="disputes",
        instance=instance,
        created=created,
        status=instance.status,
        notify_admin=True,
    )


@receiver(post_save, sender=SupportTicket)
def live_support_ticket(sender, instance, created, **kwargs):
    _send(
        [instance.user_id],
        resource="support",
        instance=instance,
        created=created,
        status=instance.status,
        notify_admin=True,
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


@receiver(pre_save, sender=Listing)
def remember_listing_publication_state(sender, instance, **kwargs):
    instance._was_public_marketplace_listing = False
    if not instance._state.adding:
        previous = sender.objects.filter(pk=instance.pk).values(
            'approval_status', 'is_published',
        ).first()
        instance._was_public_marketplace_listing = bool(
            previous
            and previous['approval_status'] == 'approved'
            and previous['is_published']
        )


@receiver(post_save, sender=Listing)
def live_listing(sender, instance, created, **kwargs):
    _send(
        [instance.user_id],
        resource="listings",
        instance=instance,
        created=created,
        status=instance.approval_status,
        notify_admin=True,
    )
    is_public_now = (
        instance.approval_status == 'approved' and instance.is_published
    )
    was_public = bool(getattr(instance, '_was_public_marketplace_listing', False))
    if is_public_now or was_public:
        schedule_marketplace_event(
            resource='listings',
            object_id=instance.id,
            action='created' if created else ('updated' if is_public_now else 'deleted'),
            status=instance.approval_status if is_public_now else 'unpublished',
        )


@receiver(post_save, sender=ListingPayment)
def live_listing_payment(sender, instance, created, **kwargs):
    _send(
        [instance.user_id],
        resource="payments",
        instance=instance,
        created=created,
        status=instance.status,
        notify_admin=True,
    )


@receiver(pre_save, sender=Mover)
def remember_mover_publication_state(sender, instance, **kwargs):
    instance._was_public_marketplace_mover = False
    if not instance._state.adding:
        previous = sender.objects.filter(pk=instance.pk).values(
            'approval_status', 'is_available',
        ).first()
        instance._was_public_marketplace_mover = bool(
            previous
            and previous['approval_status'] == 'approved'
            and previous['is_available']
        )


@receiver(post_save, sender=Mover)
def live_mover(sender, instance, created, **kwargs):
    update_fields = kwargs.get("update_fields")
    location_only_fields = {
        "current_latitude", "current_longitude", "location_updated_at", "updated_at",
    }
    if not created and update_fields and set(update_fields).issubset(location_only_fields):
        return

    _send(
        [instance.user_id],
        resource="movers",
        instance=instance,
        created=created,
        status=instance.approval_status,
        notify_admin=True,
    )
    relevant_fields = {
        "approval_status", "is_available", "operating_city", "operating_county",
        "vehicle_type", "base_rate_kes", "rate_per_km_kes", "working_days",
        "start_time", "end_time",
    }
    if created or not update_fields or relevant_fields.intersection(set(update_fields)):
        is_public_now = (
            instance.approval_status == 'approved' and instance.is_available
        )
        was_public = bool(getattr(instance, '_was_public_marketplace_mover', False))
        if is_public_now or was_public:
            schedule_marketplace_event(
                resource='movers',
                object_id=instance.id,
                action='created' if created else ('updated' if is_public_now else 'deleted'),
                status=instance.approval_status if is_public_now else 'unavailable',
            )


@receiver(post_save, sender=MoverApplication)
def live_mover_application(sender, instance, created, **kwargs):
    _send(
        [instance.applicant_id],
        resource="applications",
        instance=instance,
        created=created,
        status=instance.status,
        notify_admin=True,
        object_id=instance.applicant_id,
    )

@receiver(post_save, sender=PropertyUnit)
def live_property_unit(sender, instance, created, **kwargs):
    renter_ids = RenterUnitAssociation.objects.filter(
        unit_id=instance.id,
    ).values_list("renter_user_id", flat=True)
    _send(
        [instance.user_id, *renter_ids],
        resource="pms",
        instance=instance,
        created=created,
    )


@receiver(post_save, sender=RenterUnitAssociation)
def live_renter_association(sender, instance, created, **kwargs):
    _send(
        [instance.landlord_id, instance.renter_user_id],
        resource="pms",
        instance=instance,
        created=created,
    )


@receiver(post_save, sender=RentReminder)
def live_rent_reminder(sender, instance, created, **kwargs):
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


@receiver(post_save, sender=RentReminderSetting)
def live_rent_reminder_setting(sender, instance, created, **kwargs):
    renter_user_id = RenterUnitAssociation.objects.filter(
        pk=instance.renter_assoc_id
    ).values_list("renter_user_id", flat=True).first()
    _send([instance.landlord_id, renter_user_id], resource="rent", instance=instance, created=created)


@receiver(post_save, sender=LandlordSubscription)
def live_landlord_subscription(sender, instance, created, **kwargs):
    _send(
        [instance.landlord_id],
        resource="subscriptions",
        instance=instance,
        created=created,
        status=instance.status,
        notify_admin=True,
    )


@receiver(post_save, sender=RealEstateSubscription)
def live_real_estate_subscription(sender, instance, created, **kwargs):
    _send(
        [instance.real_estate_id],
        resource="subscriptions",
        instance=instance,
        created=created,
        status=instance.status,
        notify_admin=True,
    )


@receiver(post_save, sender=SubscriptionInvoice)
def live_subscription_invoice(sender, instance, created, **kwargs):
    user_ids = []
    if instance.landlord_subscription_id:
        user_ids.extend(
            LandlordSubscription.objects.filter(pk=instance.landlord_subscription_id)
            .values_list("landlord_id", flat=True)
        )
    if instance.real_estate_subscription_id:
        user_ids.extend(
            RealEstateSubscription.objects.filter(pk=instance.real_estate_subscription_id)
            .values_list("real_estate_id", flat=True)
        )
    _send(user_ids, resource="subscriptions", instance=instance, created=created, status=instance.status, notify_admin=True)


@receiver(post_save, sender=SubscriptionListing)
def live_subscription_listing(sender, instance, created, **kwargs):
    user_ids = []
    if instance.subscription_id:
        user_ids.extend(
            LandlordSubscription.objects.filter(pk=instance.subscription_id)
            .values_list("landlord_id", flat=True)
        )
    if instance.real_estate_subscription_id:
        user_ids.extend(
            RealEstateSubscription.objects.filter(pk=instance.real_estate_subscription_id)
            .values_list("real_estate_id", flat=True)
        )
    _send(user_ids, resource="subscriptions", instance=instance, created=created, status=instance.status)

@receiver(post_save, sender=ListingMedia)
def live_listing_media(sender, instance, created, **kwargs):
    _send([instance.user_id], resource="listings", instance=instance, created=created)
    if Listing.objects.filter(
        pk=instance.listing_id,
        approval_status='approved',
        is_published=True,
    ).exists():
        schedule_marketplace_event(
            resource='listings',
            object_id=instance.listing_id,
            action='updated',
            status='approved',
        )


@receiver(post_save, sender=LandlordPaymentMethod)
def live_landlord_payment_method(sender, instance, created, **kwargs):
    _send([instance.landlord_id], resource="pms", instance=instance, created=created)


@receiver(post_save, sender=PMSSubscriptionNotification)
def live_pms_subscription_notification(sender, instance, created, **kwargs):
    _send([instance.landlord_id], resource="pms", instance=instance, created=created)
    if created:
        from .push_notifications import send_user_notification_push
        transaction.on_commit(lambda: send_user_notification_push(
            user_id=instance.landlord_id,
            notification_id=instance.id,
            notification_type=instance.notification_type,
            title=instance.title,
            body=instance.message,
            data={
                'subscription_id': str(instance.subscription_id) if instance.subscription_id else None,
                'action_type': instance.action_type,
                'deep_link': 'pms-dashboard',
            },
        ))


@receiver(post_save, sender=CommunityPost)
def live_community_post(sender, instance, created, **kwargs):
    _send(
        [instance.user_id],
        resource="community",
        instance=instance,
        created=created,
        notify_admin=True,
    )


@receiver(post_save, sender=CommunityPostMedia)
def live_community_post_media(sender, instance, created, **kwargs):
    post_owner_id = CommunityPost.objects.filter(pk=instance.post_id).values_list(
        "user_id", flat=True
    ).first()
    _send(
        [instance.user_id, post_owner_id],
        resource="community",
        instance=instance,
        created=created,
    )


@receiver(post_save, sender=CommunityPostReaction)
def live_community_post_reaction(sender, instance, created, **kwargs):
    post_owner_id = CommunityPost.objects.filter(pk=instance.post_id).values_list(
        "user_id", flat=True
    ).first()
    _send(
        [instance.user_id, post_owner_id],
        resource="community",
        instance=instance,
        created=created,
    )


@receiver(post_save, sender=Review)
def live_review(sender, instance, created, **kwargs):
    mover_user_id = (
        Mover.objects.filter(pk=instance.mover_id).values_list("user_id", flat=True).first()
        if instance.mover_id else None
    )
    _send(
        [instance.reviewer_id, instance.reviewee_id, mover_user_id],
        resource="reviews",
        instance=instance,
        created=created,
        notify_admin=True,
    )
    if instance.listing_id and Listing.objects.filter(
        pk=instance.listing_id,
        approval_status='approved',
        is_published=True,
    ).exists():
        schedule_marketplace_event(
            resource='listings',
            object_id=instance.listing_id,
            action='updated',
            status='approved',
        )


@receiver(post_save, sender=MovingJourney)
def live_moving_journey(sender, instance, created, **kwargs):
    booking = Booking.objects.filter(pk=instance.booking_id).first()
    mover_user_id = Mover.objects.filter(pk=instance.mover_id).values_list(
        "user_id", flat=True
    ).first()
    _send(
        [booking.renter_id if booking else None, mover_user_id],
        resource="bookings",
        instance=instance,
        created=created,
        status=instance.status,
    )


@receiver(post_save, sender=MovingCancellationEvent)
def live_moving_cancellation(sender, instance, created, **kwargs):
    booking = Booking.objects.filter(pk=instance.booking_id).first()
    mover_user_id = Mover.objects.filter(pk=booking.mover_id).values_list(
        "user_id", flat=True
    ).first() if booking else None
    _send(
        [booking.renter_id if booking else None, mover_user_id, instance.cancelled_by],
        resource="bookings",
        instance=instance,
        created=created,
        status="cancelled",
    )


@receiver(post_save, sender=MovingFinancialDocument)
def live_moving_financial_document(sender, instance, created, **kwargs):
    mover_user_id = Mover.objects.filter(pk=instance.mover_id).values_list(
        "user_id", flat=True
    ).first()
    _send(
        [instance.renter_id, mover_user_id],
        resource="payments",
        instance=instance,
        created=created,
        status=instance.status,
        notify_admin=True,
    )


@receiver(post_save, sender=RealEstatePMSMember)
def live_real_estate_pms_member(sender, instance, created, **kwargs):
    _send(
        [instance.real_estate_id, instance.user_id],
        resource="pms",
        instance=instance,
        created=created,
        status=instance.status,
    )


@receiver(post_save, sender=RealEstatePMSListingAssignment)
def live_real_estate_pms_assignment(sender, instance, created, **kwargs):
    _send(
        [instance.real_estate_id, instance.agent_id, instance.assigned_by_id],
        resource="pms",
        instance=instance,
        created=created,
        status="active" if instance.is_active else "inactive",
    )


@receiver(post_save, sender=RealEstatePMSSettings)
def live_real_estate_pms_settings(sender, instance, created, **kwargs):
    _send(
        [instance.real_estate_id],
        resource="pms",
        instance=instance,
        created=created,
    )


@receiver(post_delete, sender=Listing)
def live_listing_deleted(sender, instance, **kwargs):
    was_public = instance.approval_status == 'approved' and instance.is_published
    _send(
        [instance.user_id],
        resource="listings",
        instance=instance,
        created=False,
        notify_admin=True,
        action_override="deleted",
    )
    if was_public:
        schedule_marketplace_event(
            resource='listings',
            object_id=instance.id,
            action='deleted',
            status='deleted',
        )


@receiver(post_delete, sender=ListingMedia)
def live_listing_media_deleted(sender, instance, **kwargs):
    _send(
        [instance.user_id],
        resource="listings",
        instance=instance,
        created=False,
        action_override="deleted",
    )
    if Listing.objects.filter(
        pk=instance.listing_id,
        approval_status='approved',
        is_published=True,
    ).exists():
        schedule_marketplace_event(
            resource='listings',
            object_id=instance.listing_id,
            action='updated',
            status='approved',
        )


@receiver(post_delete, sender=SupportTicket)
def live_support_ticket_deleted(sender, instance, **kwargs):
    _send(
        [instance.user_id],
        resource="support",
        instance=instance,
        created=False,
        notify_admin=True,
        action_override="deleted",
    )


@receiver(post_delete, sender=CommunityPost)
def live_community_post_deleted(sender, instance, **kwargs):
    _send(
        [instance.user_id],
        resource="community",
        instance=instance,
        created=False,
        notify_admin=True,
        action_override="deleted",
    )


@receiver(post_delete, sender=CommunityPostReaction)
def live_community_post_reaction_deleted(sender, instance, **kwargs):
    post_owner_id = CommunityPost.objects.filter(pk=instance.post_id).values_list(
        "user_id", flat=True
    ).first()
    _send(
        [instance.user_id, post_owner_id],
        resource="community",
        instance=instance,
        created=False,
        action_override="deleted",
    )

@receiver(post_delete, sender=Mover)
def live_mover_deleted(sender, instance, **kwargs):
    was_public = (
        instance.approval_status == 'approved' and instance.is_available
    )
    _send(
        [instance.user_id],
        resource="movers",
        instance=instance,
        created=False,
        notify_admin=True,
        action_override="deleted",
    )
    if was_public:
        schedule_marketplace_event(
            resource='movers',
            object_id=instance.id,
            action='deleted',
            status='deleted',
        )


@receiver(post_delete, sender=PropertyUnit)
def live_property_unit_deleted(sender, instance, **kwargs):
    renter_ids = RenterUnitAssociation.objects.filter(
        unit_id=instance.id,
    ).values_list("renter_user_id", flat=True)
    _send(
        [instance.user_id, *renter_ids],
        resource="pms",
        instance=instance,
        created=False,
        action_override="deleted",
    )


@receiver(post_delete, sender=RenterUnitAssociation)
def live_renter_association_deleted(sender, instance, **kwargs):
    _send(
        [instance.landlord_id, instance.renter_user_id],
        resource="pms",
        instance=instance,
        created=False,
        action_override="deleted",
    )


@receiver(post_delete, sender=LandlordPaymentMethod)
def live_landlord_payment_method_deleted(sender, instance, **kwargs):
    _send(
        [instance.landlord_id],
        resource="pms",
        instance=instance,
        created=False,
        action_override="deleted",
    )


@receiver(post_delete, sender=PMSSubscriptionNotification)
def live_pms_subscription_notification_deleted(sender, instance, **kwargs):
    _send(
        [instance.landlord_id],
        resource="pms",
        instance=instance,
        created=False,
        action_override="deleted",
    )


@receiver(post_delete, sender=CommunityPostMedia)
def live_community_post_media_deleted(sender, instance, **kwargs):
    post_owner_id = CommunityPost.objects.filter(pk=instance.post_id).values_list(
        "user_id", flat=True
    ).first()
    _send(
        [instance.user_id, post_owner_id],
        resource="community",
        instance=instance,
        created=False,
        action_override="deleted",
    )


@receiver(post_delete, sender=Review)
def live_review_deleted(sender, instance, **kwargs):
    mover_user_id = (
        Mover.objects.filter(pk=instance.mover_id).values_list("user_id", flat=True).first()
        if instance.mover_id else None
    )
    _send(
        [instance.reviewer_id, instance.reviewee_id, mover_user_id],
        resource="reviews",
        instance=instance,
        created=False,
        notify_admin=True,
        action_override="deleted",
    )
    if instance.listing_id and Listing.objects.filter(
        pk=instance.listing_id,
        approval_status='approved',
        is_published=True,
    ).exists():
        schedule_marketplace_event(
            resource='listings',
            object_id=instance.listing_id,
            action='updated',
            status='approved',
        )


@receiver(post_delete, sender=RealEstatePMSMember)
def live_real_estate_pms_member_deleted(sender, instance, **kwargs):
    _send(
        [instance.real_estate_id, instance.user_id],
        resource="pms",
        instance=instance,
        created=False,
        action_override="deleted",
    )


@receiver(post_delete, sender=RealEstatePMSListingAssignment)
def live_real_estate_pms_assignment_deleted(sender, instance, **kwargs):
    _send(
        [instance.real_estate_id, instance.agent_id, instance.assigned_by_id],
        resource="pms",
        instance=instance,
        created=False,
        action_override="deleted",
    )


@receiver(post_delete, sender=RealEstatePMSSettings)
def live_real_estate_pms_settings_deleted(sender, instance, **kwargs):
    _send(
        [instance.real_estate_id],
        resource="pms",
        instance=instance,
        created=False,
        action_override="deleted",
    )

