from django.core.exceptions import PermissionDenied

from .models import Profile

ADMIN_ROLES = {'admin'}
CONTENT_ROLES = {'landlord', 'real_estate'}


def is_admin(user):
    return bool(user and user.is_authenticated and (user.is_staff or user.is_superuser or getattr(user, 'is_admin', False) or getattr(user, 'role', None) in ADMIN_ROLES))


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
    if not user or not user.is_authenticated:
        return False
    if is_admin(user):
        return True
    role = getattr(user, 'role', None)
    if role not in CONTENT_ROLES:
        return False
    if not getattr(user, 'email_verified', False) or not getattr(user, 'kyc_completed', False):
        return False
    field = 'landlord_application_status' if role == 'landlord' else 'real_estate_application_status'
    return getattr(user, field, None) == 'approved'


def can_access_pms(user):
    """Return whether this account may enter the landlord PMS boundary."""
    if not user or not user.is_authenticated:
        return False
    if is_admin(user):
        return True
    from apps.subscriptions.services import get_pms_access
    return bool(get_pms_access(user).get('allowed'))


def pms_access(user):
    if not user or not user.is_authenticated:
        return {'allowed': False, 'reason': 'AUTHENTICATION_REQUIRED', 'read_only': False}
    if is_admin(user):
        return {'allowed': True, 'reason': 'ADMIN', 'read_only': False}
    from apps.subscriptions.services import get_pms_access
    return get_pms_access(user)


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
    return bool(user and user.is_authenticated and (is_admin(user) or owns(user, message.sender_id) or owns(user, message.receiver_id)))


def can_modify_own(user, owner_id):
    return owns(user, owner_id)
