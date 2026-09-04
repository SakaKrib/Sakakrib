from django.db import transaction
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.authorization import is_admin
from apps.core.domain_platform import Mover, MoverApplication

from .models import Profile
from .serializers import ProfileSerializer


APPLICATION_FIELDS = {
    'landlord': 'landlord_application_status',
    'real_estate': 'real_estate_application_status',
    'mover': 'mover_application_status',
}
ALLOWED_STATUSES = {'pending', 'approved', 'rejected'}

# Keep Profile.kyc_status aligned with the application lifecycle.  The
# existing KYC submission convention is `pending`; there is no database
# CHECK constraint restricting this field, so these terminal values are
# safe, explicit state values rather than leaving stale `pending` data after
# an admin decision.
KYC_STATUS_BY_APPLICATION_STATUS = {
    'pending': 'pending',
    'approved': 'approved',
    'rejected': 'rejected',
}


def _role_and_kyc_state(application_type, status_value):
    """Return the canonical Profile state for an application decision."""
    if status_value == 'approved':
        return application_type, True, 'verified'
    return 'renter', False, 'rejected' if status_value == 'rejected' else 'pending_verification'


class AdminApplicationStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, user_id):
        if not is_admin(request.user):
            return Response({'detail': 'Administrator access is required.'}, status=403)

        profile = Profile.objects.filter(pk=user_id).first()
        if not profile:
            return Response({'detail': 'User profile was not found.'}, status=404)

        application_type = str(request.data.get('application_type') or '').strip().lower()
        status_value = str(request.data.get('status') or '').strip().lower()
        if application_type not in APPLICATION_FIELDS:
            return Response({'detail': 'application_type must be landlord, real_estate, or mover.'}, status=400)
        if status_value not in ALLOWED_STATUSES:
            return Response({'detail': 'status must be pending, approved, or rejected.'}, status=400)

        note = request.data.get('admin_review_note')
        note = str(note).strip() if note is not None else ''
        field = APPLICATION_FIELDS[application_type]
        new_role, kyc_completed, verification_status = _role_and_kyc_state(application_type, status_value)
        kyc_status = KYC_STATUS_BY_APPLICATION_STATUS[status_value]

        with transaction.atomic():
            locked = Profile.objects.select_for_update().get(pk=profile.pk)
            setattr(locked, field, status_value)
            locked.role = new_role
            locked.admin_review_note = note
            locked.kyc_status = kyc_status
            locked.verification_status = verification_status
            locked.kyc_completed = kyc_completed
            locked.updated_at = timezone.now()
            locked.save(update_fields=[
                field,
                'role',
                'admin_review_note',
                'kyc_status',
                'verification_status',
                'kyc_completed',
                'updated_at',
            ])

            if application_type == 'mover':
                mover_status = 'pending_review' if status_value == 'pending' else status_value
                mover = Mover.objects.select_for_update().filter(user_id=locked.id).first()
                if mover:
                    mover.approval_status = mover_status
                    mover.is_available = status_value == 'approved'
                    mover.updated_at = timezone.now()
                    mover.save(update_fields=['approval_status', 'is_available', 'updated_at'])

                mover_application = MoverApplication.objects.select_for_update().filter(
                    applicant_id=locked.id
                ).order_by('-created_at').first()
                if mover_application:
                    mover_application.status = status_value
                    mover_application.review_notes = note or None
                    mover_application.reviewed_by = request.user.id
                    mover_application.reviewed_at = timezone.now()
                    mover_application.updated_at = timezone.now()
                    mover_application.save(update_fields=[
                        'status',
                        'review_notes',
                        'reviewed_by',
                        'reviewed_at',
                        'updated_at',
                    ])

        return Response(ProfileSerializer(locked).data)
