from django.db import transaction
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Profile
from .serializers import ProfileSerializer


class LandlordApplicationSubmitView(APIView):
    """Django replacement for the legacy submit_landlord_application RPC."""

    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        profile = Profile.objects.select_for_update().get(pk=request.user.pk)

        if profile.role != 'landlord':
            return Response({'success': False, 'code': 'INVALID_ROLE', 'message': 'Your account is not registered as a landlord.'}, status=400)
        if not profile.email_verified:
            return Response({'success': False, 'code': 'EMAIL_NOT_VERIFIED', 'message': 'Please verify your email before applying.'}, status=403)
        if not profile.kyc_completed:
            return Response({'success': False, 'code': 'KYC_REQUIRED', 'message': 'Please complete identity verification before applying.'}, status=403)
        if not profile.id_document_url:
            return Response({'success': False, 'code': 'DOCUMENT_REQUIRED', 'message': 'An identity document is required before applying.'}, status=400)

        current = str(profile.landlord_application_status or 'not_requested').lower()
        if current == 'pending':
            return Response({'success': False, 'code': 'ALREADY_PENDING', 'message': 'Your landlord application is already pending review.'}, status=409)
        if current == 'approved':
            return Response({'success': False, 'code': 'ALREADY_APPROVED', 'message': 'Your landlord application has already been approved.'}, status=409)

        profile.landlord_application_status = 'pending'
        profile.updated_at = timezone.now()
        profile.save(update_fields=['landlord_application_status', 'updated_at'])

        return Response({
            'success': True,
            'code': 'SUBMITTED',
            'message': 'Your landlord application has been submitted for review.',
            'profile': ProfileSerializer(profile).data,
        }, status=200)
