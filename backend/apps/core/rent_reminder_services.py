from django.core.exceptions import ValidationError
from django.db import transaction

from apps.accounts.models import Profile
from apps.listings.models import Listing
from apps.subscriptions.services import get_pms_access

from .domain_property import PropertyUnit, RenterUnitAssociation
from .notification_services import dispatch_user_notification


@transaction.atomic
def send_rent_payment_reminder(*, landlord_id, renter_assoc_id, message=None):
    profile = Profile.objects.filter(pk=landlord_id).first()
    access = get_pms_access(profile)
    if not access.get("allowed") or access.get("role") != "landlord":
        raise PermissionError("Landlord PMS access is required")
    if access.get("read_only"):
        raise PermissionError("PMS is read-only during the subscription grace period")

    association = (
        RenterUnitAssociation.objects
        .select_for_update()
        .filter(id=renter_assoc_id, landlord_id=landlord_id, status="ACTIVE")
        .first()
    )
    if not association:
        raise ValidationError("Active renter association not found")

    if not association.renter_user_id:
        raise ValidationError("This renter has not yet claimed their account")

    unit = PropertyUnit.objects.filter(id=association.unit_id).first()
    if not unit:
        raise ValidationError("Property unit not found")

    listing = Listing.objects.filter(id=unit.listing_id).first()
    if not listing:
        raise ValidationError("Listing not found")

    custom_message = str(message or "").strip()
    final_message = custom_message or (
        f"This is a reminder that rent of KES {association.rent_amount} "
        f"for {listing.title} - Unit {unit.unit_number} is due."
    )

    notification = dispatch_user_notification(
        user_id=association.renter_user_id,
        notification_type="PAYMENT_REMINDER",
        title="Rent payment reminder",
        message=final_message,
        data={
            "association_id": str(association.id),
            "unit_id": str(association.unit_id),
        },
        event_key=None,
        send_email=True,
        email_template="payment_reminder",
    )

    return {
        "in_app_sent": notification.get("notification_id") is not None,
        "email_sent": notification.get("email_id") is not None,
        "whatsapp_sent": False,
        "notification_id": notification.get("notification_id"),
        "email_id": notification.get("email_id"),
    }
