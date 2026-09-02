from django.db import transaction
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.authorization import is_admin

from .models import Profile
from .serializers import ProfileSerializer


APPLICATION_FIELDS = {
    'landlord': 'landlord_application_status',
    'real_estate': 'real_estate_application_status',
    'mover': 'mover_application_status',
}
ALLOWED_STATUSES = {'pending', 'approved', 'rejected'}


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

        with transaction.atomic():
            locked = Profile.objects.select_for_update().get(pk=profile.pk)
            setattr(locked, field, status_value)
            locked.admin_review_note = note
            if status_value == 'approved':
                locked.verification_status = 'verified'
                locked.kyc_completed = True
            elif status_value == 'rejected':
                locked.verification_status = 'rejected'
                locked.kyc_completed = False
            else:
                locked.verification_status = 'pending_verification'
                locked.kyc_completed = False
            locked.updated_at = timezone.now()
            locked.save(update_fields=[field, 'admin_review_note', 'verification_status', 'kyc_completed', 'updated_at'])

        return Response(ProfileSerializer(locked).data)
