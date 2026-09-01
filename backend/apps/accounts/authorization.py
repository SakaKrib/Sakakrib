from django.core.exceptions import PermissionDenied

from .models import Profile


ADMIN_ROLES = {'admin'}
CONTENT_ROLES = {'landlord', 'real_estate'}


def is_admin(user):
    return bool(
        user
        and user.is_authenticated
        and (
            user.is_staff
            or user.is_superuser
            or getattr(user, 'is_admin', False)
            or getattr(user, 'role', None) in ADMIN_ROLES
        )
    )


def require_admin(user):
    if not is_admin(user):
        raise PermissionDenied('Administrator access is required.')
    return user


def owns(user, owner_id):
    return bool(user and user.is_authenticated and str(user.pk) == str(owner_id))


def require_owner(user, owner_id):
    if not owns(user, owner_id):
        raise PermissionDenied('You may only access your own resource.')
    return user


def can_manage_listings(user):
    """Mirror the verified/approved production listing-management gate."""
    if not user or not user.is_authenticated:
        return False
    if is_admin(user):
        return True
    role = getattr(user, 'role', None)
    if role not in CONTENT_ROLES:
        return False
    if not getattr(user, 'email_verified', False) or not getattr(user, 'kyc_completed', False):
        return False
    if role == 'landlord':
        return getattr(user, 'landlord_application_status', None) == 'approved'
    if role == 'real_estate':
        return getattr(user, 'realestate_application_status', None) == 'approved'
    return False


def can_view_public_listings(user):
    return bool(user and user.is_authenticated and getattr(user, 'email_verified', False))


def can_view_mover(user, mover):
    if not user or not user.is_authenticated:
        return False
    if is_admin(user) or owns(user, mover.user_id):
        return True
    return mover.approval_status == 'approved' and mover.is_available


def can_access_booking(user, booking, mover_user_ids=None):
    if not user or not user.is_authenticated:
        return False
    if is_admin(user) or owns(user, booking.renter_id):
        return True
    return bool(mover_user_ids and str(user.pk) in {str(v) for v in mover_user_ids})


def can_access_moving_invoice(user, invoice, mover_user_ids=None):
    if not user or not user.is_authenticated:
        return False
    if is_admin(user) or owns(user, invoice.renter_id):
        return True
    return bool(mover_user_ids and str(user.pk) in {str(v) for v in mover_user_ids})


def can_access_chat(user, message):
    return bool(
        user
        and user.is_authenticated
        and (is_admin(user) or owns(user, message.sender_id) or owns(user, message.receiver_id))
    )


def can_modify_own(user, owner_id):
    return owns(user, owner_id)
