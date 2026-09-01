import hashlib
import secrets
from datetime import timedelta

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from apps.listings.models import Listing
from .domain_property import PropertyUnit, RenterUnitAssociation
from .domain_platform import NotificationEmail
from .notification_services import dispatch_user_notification


def _hash_token(token):
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


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
def create_renter_invitation(*, landlord_id, unit_id, renter_name, renter_phone, renter_email, app_base_url=None):
    name, email = (renter_name or "").strip(), (renter_email or "").strip()
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
    if app_base_url:
        link = f"{app_base_url.rstrip('/')}/#claim-rental/{token}"
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
    row = RenterUnitAssociation.objects.select_for_update().filter(id=association_id, landlord_id=landlord_id, status="PENDING").first()
    if row is None:
        raise ValidationError("Pending invitation not found or not owned by this account.")
    token = secrets.token_hex(32)
    now = timezone.now()
    row.invite_token_hash = _hash_token(token); row.invited_at = now; row.invite_expires_at = now + timedelta(days=14); row.updated_at = now
    row.save(update_fields=["invite_token_hash", "invited_at", "invite_expires_at", "updated_at"])
    if app_base_url and row.renter_email:
        link = f"{app_base_url.rstrip('/')}/#claim-rental/{token}"
        NotificationEmail.objects.create(recipient=row.renter_email, subject="Reminder: you've been invited to SakaCrib",
            html_body=f"<p>Reminder: open this link to claim your rental:</p><p><a href=\"{link}\">{link}</a></p><p>This link expires in 14 days.</p>",
            template_type="renter_invitation", status="pending")
    return {"id": str(row.id), "invited_at": row.invited_at.isoformat(), "invite_expires_at": row.invite_expires_at.isoformat(), "invite_token": token}
