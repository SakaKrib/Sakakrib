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


def _materialize_mover(*, profile, mover_application, status_value, now):
    """Create or synchronize the canonical mover record from its application."""
    mover = Mover.objects.select_for_update().filter(user_id=profile.id).first()

    if status_value != 'approved':
        if mover:
            mover.approval_status = 'pending_review' if status_value == 'pending' else status_value
            mover.is_available = False
            mover.updated_at = now
            mover.save(update_fields=['approval_status', 'is_available', 'updated_at'])
        return mover

    if mover_application is None:
        # Approval can only materialize a marketplace mover when the application
        # carrying the mover-specific data exists. Keep the profile decision
        # intact rather than creating an incomplete marketplace record.
        return mover

    mover_defaults = {
        'driver_full_name': mover_application.driver_full_name or profile.full_name or '',
        'national_id': mover_application.national_id or profile.national_id or '',
        'dl_number': mover_application.dl_number or profile.dl_number or '',
        'dl_photo_url': mover_application.dl_photo_url or '',
        'vehicle_type': mover_application.vehicle_type or 'pickup',
        'number_plate': mover_application.number_plate or '',
        'operating_city': mover_application.operating_city or profile.city or '',
        'operating_county': mover_application.operating_county or profile.county or '',
        'phone': mover_application.phone or profile.phone or '',
        'base_rate_kes': mover_application.base_rate_kes,
        'rate_per_km_kes': mover_application.rate_per_km_kes,
        'payment_channel': mover_application.payment_channel or 'mpesa_send_money',
        'payment_account': mover_application.payment_account or '',
        'insurance_policy_details': mover_application.insurance_policy_details or '',
        'vehicle_inspection_expiry': mover_application.vehicle_inspection_expiry,
        'liability_accepted': mover_application.liability_accepted,
        'terms_accepted': mover_application.terms_accepted,
        'reference_contacts': mover_application.reference_contacts or [],
        'working_days': mover_application.working_days or [],
        'start_time': mover_application.start_time,
        'end_time': mover_application.end_time,
        'capacity_details': mover_application.capacity_details or '',
        'approval_status': 'approved',
        'is_available': True,
        'updated_at': now,
    }

    if mover is None:
        mover_defaults['user_id'] = profile.id
        mover_defaults['created_at'] = now
        return Mover.objects.create(**mover_defaults)

    for field, value in mover_defaults.items():
        if field not in {'user_id', 'created_at'}:
            setattr(mover, field, value)
    mover.save(update_fields=[field for field in mover_defaults if field not in {'user_id', 'created_at'}])
    return mover


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
        mover_application = (
            MoverApplication.objects.select_for_update()
            .filter(applicant_id=profile.id)
            .order_by('-created_at')
            .first()
        )

        _materialize_mover(
            profile=profile,
            mover_application=mover_application,
            status_value=status_value,
            now=now,
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
