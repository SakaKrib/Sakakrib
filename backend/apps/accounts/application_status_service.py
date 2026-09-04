from django.db import transaction
from django.utils import timezone

from apps.accounts.authorization import is_admin
from apps.core.domain_platform import Mover, MoverApplication

from .models import Profile


APPLICATION_FIELDS = {
    'landlord': 'landlord_application_status',
    'real_estate': 'real_estate_application_status',
    'mover': 'mover_application_status',
}
ALLOWED_STATUSES = {'pending', 'approved', 'rejected'}
KYC_STATUS_BY_APPLICATION_STATUS = {
    'pending': 'pending',
    'approved': 'approved',
    'rejected': 'rejected',
}


def _canonical_profile_state(application_type, status_value):
    if status_value == 'approved':
        return {
            'role': application_type,
            'kyc_completed': True,
            'kyc_status': KYC_STATUS_BY_APPLICATION_STATUS[status_value],
            'verification_status': 'verified',
        }

    return {
        'role': 'renter',
        'kyc_completed': False,
        'kyc_status': KYC_STATUS_BY_APPLICATION_STATUS[status_value],
        'verification_status': (
            'rejected' if status_value == 'rejected' else 'pending_verification'
        ),
    }


@transaction.atomic
def set_application_status(*, admin_user, user_id, application_type, status_value, note=''):
    """Apply one canonical application decision and synchronize all state."""
    if not is_admin(admin_user):
        raise PermissionError('Administrator access is required.')

    application_type = str(application_type or '').strip().lower()
    status_value = str(status_value or '').strip().lower()
    if application_type not in APPLICATION_FIELDS:
        raise ValueError('application_type must be landlord, real_estate, or mover.')
    if status_value not in ALLOWED_STATUSES:
        raise ValueError('status must be pending, approved, or rejected.')

    profile = Profile.objects.select_for_update().filter(pk=user_id).first()
    if not profile:
        raise LookupError('User profile was not found.')

    field = APPLICATION_FIELDS[application_type]
    state = _canonical_profile_state(application_type, status_value)
    now = timezone.now()
    note = str(note or '').strip()

    setattr(profile, field, status_value)
    profile.role = state['role']
    profile.admin_review_note = note
    profile.kyc_status = state['kyc_status']
    profile.verification_status = state['verification_status']
    profile.kyc_completed = state['kyc_completed']
    profile.updated_at = now
    profile.save(update_fields=[
        field,
        'role',
        'admin_review_note',
        'kyc_status',
        'verification_status',
        'kyc_completed',
        'updated_at',
    ])

    if application_type == 'mover':
        mover = Mover.objects.select_for_update().filter(user_id=profile.id).first()
        if mover:
            mover.approval_status = 'pending_review' if status_value == 'pending' else status_value
            mover.is_available = status_value == 'approved'
            mover.updated_at = now
            mover.save(update_fields=['approval_status', 'is_available', 'updated_at'])

        mover_application = (
            MoverApplication.objects.select_for_update()
            .filter(applicant_id=profile.id)
            .order_by('-created_at')
            .first()
        )
        if mover_application:
            mover_application.status = status_value
            mover_application.review_notes = note or None
            mover_application.reviewed_by = getattr(admin_user, 'id', None)
            mover_application.reviewed_at = now
            mover_application.updated_at = now
            mover_application.save(update_fields=[
                'status',
                'review_notes',
                'reviewed_by',
                'reviewed_at',
                'updated_at',
            ])

    return profile
