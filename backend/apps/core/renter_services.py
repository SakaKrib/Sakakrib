import hashlib
import secrets
from datetime import timedelta

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import Profile
from apps.listings.models import Listing
from apps.subscriptions.services import get_pms_access
from .domain_property import PropertyUnit, RenterUnitAssociation
from .domain_platform import NotificationEmail
from .notification_services import dispatch_user_notification
from .email_templates import APP_LINK_BASE_URL


def _public_app_origin(requested_origin=None):
    """Public HTTPS origin for emailed app links; never the in-app capacitor/localhost origin."""
    from .email_templates import APP_LINK_BASE_URL
    configured = str(APP_LINK_BASE_URL or "").strip().rstrip("/")
    if configured.startswith("https://"):
        return configured
    return str(requested_origin or "").strip().rstrip("/")


def _hash_token(token):
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _require_landlord_write(landlord_id):
    profile = Profile.objects.filter(pk=landlord_id).first()
    access = get_pms_access(profile)
    if not access.get("allowed") or access.get("role") != "landlord":
        raise ValidationError("An active landlord PMS subscription is required.")
    if access.get("read_only"):
        raise ValidationError("PMS is read-only during the subscription grace period.")


def _preview(row):
    unit = PropertyUnit.objects.get(id=row.unit_id)
    listing = Listing.objects.get(id=unit.listing_id)
    status = row.status
    if status == "PENDING" and row.invite_expires_at and row.invite_expires_at < timezone.now():
        status = "EXPIRED"
    return {"renter_name": row.renter_name, "unit_number": unit.unit_number, "unit_type": unit.unit_type,
            "rent_amount": str(row.rent_amount), "property_title": listing.title, "property_city": listing.city,
            "invitation_status": status}


@transaction.atomic
def create_renter_unit_request(*, renter_user_id, unit_id):
    """Create a renter-originated request for a vacant PMS unit.

    This deliberately reuses RenterUnitAssociation as the pending rental
    relationship. It is not a mover Booking and it does not create a rent
    invoice or payment transaction.
    """
    renter = Profile.objects.filter(pk=renter_user_id).first()
    if renter is None:
        raise ValidationError("Renter account not found.")
    if str(getattr(renter, "role", "")).lower() != "renter":
        raise ValidationError("Only renter accounts can request a property unit.")
    if not getattr(renter, "email_verified", False):
        raise ValidationError("Email verification is required before requesting a unit.")

    unit = PropertyUnit.objects.select_for_update().filter(pk=unit_id).first()
    if unit is None:
        raise ValidationError("Property unit not found.")
    listing = Listing.objects.filter(
        pk=unit.listing_id,
        is_property_management=True,
        is_approved=True,
        is_published=True,
        booking_enabled=True,
    ).first()
    if listing is None:
        raise ValidationError("This property is not currently accepting unit booking requests.")

    occupied = str(unit.availability or "").strip().lower() in {"occupied", "unavailable", "rented", "leased"}
    if occupied:
        raise ValidationError("This unit is no longer available.")

    # Lock the unit's existing associations while the unit itself is locked.
    # This prevents two renters from creating competing pending requests at
    # the same time and also respects an existing landlord-created invitation.
    associations = list(
        RenterUnitAssociation.objects.select_for_update().filter(unit_id=unit.id)
    )
    now = timezone.now()
    for association in associations:
        if association.status == "ACTIVE":
            raise ValidationError("This unit is no longer available.")
        if association.status == "PENDING":
            if association.invite_expires_at and association.invite_expires_at <= now:
                association.status = "EXPIRED"
                association.updated_at = now
                association.save(update_fields=["status", "updated_at"])
                continue
            if str(association.renter_user_id or "") == str(renter_user_id):
                raise ValidationError("You already have a pending request for this unit.")
            raise ValidationError("This unit already has a pending rental request.")

    owner = Profile.objects.filter(pk=listing.user_id).first()
    if owner is None or str(getattr(owner, "role", "")).lower() not in {"landlord", "real_estate"}:
        raise ValidationError("This property's owner cannot receive rental requests.")
    if get_pms_access(owner).get("allowed") is not True:
        raise ValidationError("This property's PMS access is not currently active.")

    row = RenterUnitAssociation.objects.create(
        unit_id=unit.id,
        landlord_id=owner.id,
        renter_user_id=renter.id,
        renter_name=(renter.full_name or renter.email or "Renter").strip(),
        renter_phone=getattr(renter, "phone", None),
        renter_email=renter.email,
        rent_amount=unit.rent,
        status="PENDING",
        invited_at=now,
        invite_expires_at=now + timedelta(days=7),
    )
    dispatch_user_notification(
        user_id=owner.id,
        notification_type="RENTER_UNIT_REQUESTED",
        title="New rental request",
        message=f"{row.renter_name} requested Unit {unit.unit_number} at {listing.title}.",
        data={
            "association_id": str(row.id),
            "unit_id": str(unit.id),
            "listing_id": str(listing.id),
            "deep_link": "pms-dashboard",
        },
        email_payload={
            "renter_name": row.renter_name,
            "renter_email": row.renter_email,
            "renter_phone": row.renter_phone,
            "property_title": listing.title,
            "property_city": listing.city,
            "unit_number": unit.unit_number,
            "unit_type": unit.unit_type,
            "rent_amount": f"KES {row.rent_amount:,.2f}",
            "requested_at": timezone.localtime(row.created_at).strftime("%d %b %Y, %I:%M %p"),
            "expires_at": timezone.localtime(row.invite_expires_at).strftime("%d %b %Y, %I:%M %p"),
            "request_url": f"{APP_LINK_BASE_URL}/app/pms-dashboard",
        },
        event_key=f"renter-unit-requested:{row.id}",
        email_template="renter_unit_request",
    )
    return {
        "id": str(row.id),
        "unit_id": str(unit.id),
        "listing_id": str(listing.id),
        "status": row.status,
        "renter_name": row.renter_name,
        "rent_amount": str(row.rent_amount),
        "created_at": row.created_at.isoformat(),
        "expires_at": row.invite_expires_at.isoformat(),
    }


@transaction.atomic
def create_renter_invitation(*, landlord_id, unit_id, renter_name, renter_phone, renter_email, app_base_url=None):
    _require_landlord_write(landlord_id)
    name, email = (renter_name or "").strip(), (renter_email or "").strip().lower()
    if not name:
        raise ValidationError("Renter name is required.")
    if not email:
        raise ValidationError("Renter email is required.")
    unit = PropertyUnit.objects.select_for_update().filter(id=unit_id, user_id=landlord_id).first()
    if unit is None:
        raise ValidationError("Unit not found or not owned by this account.")
    if RenterUnitAssociation.objects.filter(unit_id=unit_id, status__in=["ACTIVE", "PENDING"]).exists():
        raise ValidationError("This unit already has an active or pending renter association.")
    token = secrets.token_hex(32)
    row = RenterUnitAssociation.objects.create(unit_id=unit.id, landlord_id=landlord_id, renter_name=name,
        renter_phone=(renter_phone or "").strip() or None, renter_email=email, rent_amount=unit.rent,
        status="PENDING", invite_token_hash=_hash_token(token), invited_at=timezone.now(),
        invite_expires_at=timezone.now() + timedelta(days=14))
    if app_base_url or _public_app_origin(app_base_url):
        link = f"{_public_app_origin(app_base_url)}/app/claim-rental/{token}"
        NotificationEmail.objects.create(recipient=email, subject="You've been invited to SakaCrib",
            html_body=f"<p>You have been invited to connect your rental to SakaCrib.</p><p>Open this link to review the details and claim your rental:</p><p><a href=\"{link}\">{link}</a></p><p>This link expires in 14 days.</p>",
            template_type="renter_invitation", status="pending")
    return {"id": str(row.id), "unit_id": str(row.unit_id), "renter_name": row.renter_name,
            "renter_phone": row.renter_phone, "renter_email": row.renter_email, "rent_amount": str(row.rent_amount),
            "status": row.status, "invited_at": row.invited_at.isoformat(), "invite_expires_at": row.invite_expires_at.isoformat(),
            "invite_token": token}


def preview_renter_invitation(*, token):
    if not token:
        raise ValidationError("Invitation token is required.")
    row = RenterUnitAssociation.objects.filter(invite_token_hash=_hash_token(token)).first()
    if row is None:
        raise ValidationError("Invitation not found.")
    return _preview(row)


@transaction.atomic
def claim_renter_invitation(*, renter_user_id, token):
    if not token:
        raise ValidationError("Invitation token is required.")
    row = RenterUnitAssociation.objects.select_for_update().filter(
        invite_token_hash=_hash_token(token), status="PENDING", renter_user_id__isnull=True
    ).first()
    if row is None or (row.invite_expires_at and row.invite_expires_at <= timezone.now()):
        raise ValidationError("This invitation is invalid, expired, already claimed, or no longer available.")

    renter = Profile.objects.filter(pk=renter_user_id).only("email", "email_verified").first()
    if renter is None or not str(renter.email or "").strip() or not renter.email_verified:
        raise ValidationError("A verified renter account email is required to claim this rental.")
    invited_email = str(row.renter_email or "").strip().lower()
    account_email = str(renter.email or "").strip().lower()
    if invited_email != account_email:
        raise ValidationError("This invitation was sent to a different email address.")

    row.renter_user_id = renter_user_id
    row.status = "ACTIVE"
    row.claimed_at = timezone.now()
    row.updated_at = timezone.now()
    row.save(update_fields=["renter_user_id", "status", "claimed_at", "updated_at"])
    dispatch_user_notification(user_id=row.landlord_id, notification_type="RENTER_CLAIMED_UNIT",
        title="Rental claimed", message=f"{row.renter_name} has successfully claimed their rental.",
        data={"association_id": str(row.id), "unit_id": str(row.unit_id)}, event_key=f"renter-claimed:{row.id}")
    return {"id": str(row.id), "unit_id": str(row.unit_id), "landlord_id": str(row.landlord_id),
            "renter_user_id": str(row.renter_user_id), "status": row.status, "claimed_at": row.claimed_at.isoformat()}


@transaction.atomic
def resend_renter_invitation(*, landlord_id, association_id, app_base_url=None):
    _require_landlord_write(landlord_id)
    row = RenterUnitAssociation.objects.select_for_update().filter(id=association_id, landlord_id=landlord_id, status="PENDING").first()
    if row is None:
        raise ValidationError("Pending invitation not found or not owned by this account.")
    token = secrets.token_hex(32)
    now = timezone.now()
    row.invite_token_hash = _hash_token(token); row.invited_at = now; row.invite_expires_at = now + timedelta(days=14); row.updated_at = now
    row.save(update_fields=["invite_token_hash", "invited_at", "invite_expires_at", "updated_at"])
    if app_base_url and row.renter_email:
        link = f"{_public_app_origin(app_base_url)}/app/claim-rental/{token}"
        NotificationEmail.objects.create(recipient=row.renter_email, subject="Reminder: you've been invited to SakaCrib",
            html_body=f"<p>Reminder: open this link to claim your rental:</p><p><a href=\"{link}\">{link}</a></p><p>This link expires in 14 days.</p>",
            template_type="renter_invitation", status="pending")
    return {"id": str(row.id), "invited_at": row.invited_at.isoformat(), "invite_expires_at": row.invite_expires_at.isoformat(), "invite_token": token}


@transaction.atomic
def cancel_renter_invitation(*, landlord_id, association_id):
    _require_landlord_write(landlord_id)
    row = RenterUnitAssociation.objects.select_for_update().filter(
        id=association_id, landlord_id=landlord_id, status="PENDING"
    ).first()
    if row is None:
        raise ValidationError("Pending invitation not found or not owned by this account.")
    row.status = "EXPIRED"
    row.updated_at = timezone.now()
    row.save(update_fields=["status", "updated_at"])
    return {"success": True, "id": str(row.id), "status": row.status}
