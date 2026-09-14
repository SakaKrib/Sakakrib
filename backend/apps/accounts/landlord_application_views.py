from pathlib import Path
import logging

from django.conf import settings
from django.core.files.storage import default_storage
from django.db import transaction
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.email_services import queue_email

from .models import Profile
from .serializers import ProfileSerializer

logger = logging.getLogger(__name__)
ALLOWED_ID_DOCUMENT_BUCKETS = {'id-documents', 'kyc-documents'}


class LandlordApplicationSubmitView(APIView):
    """Django replacement for the legacy submit_landlord_application RPC."""

    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        profile = Profile.objects.select_for_update().get(pk=request.user.pk)
        role = str(profile.role or '').strip().lower()
        if role not in {'landlord', 'real_estate'}:
            return Response({'success': False, 'code': 'INVALID_ROLE', 'message': 'Your account is not registered as a landlord or real estate professional.'}, status=400)
        if not profile.email_verified:
            return Response({'success': False, 'code': 'EMAIL_NOT_VERIFIED', 'message': 'Please verify your email before applying.'}, status=403)
        if not profile.kyc_completed:
            return Response({'success': False, 'code': 'KYC_REQUIRED', 'message': 'Please complete identity verification before applying.'}, status=403)

        application_type = role
        status_field = 'landlord_application_status' if role == 'landlord' else 'real_estate_application_status'
        current = str(getattr(profile, status_field, 'not_requested') or 'not_requested').lower()
        display_role = 'landlord' if role == 'landlord' else 'real estate'
        if current == 'pending':
            return Response({'success': False, 'code': 'ALREADY_PENDING', 'message': f'Your {display_role} application is already pending review.'}, status=409)
        if current == 'approved':
            return Response({'success': False, 'code': 'ALREADY_APPROVED', 'message': f'Your {display_role} application has already been approved.'}, status=409)

        first_name = str(request.data.get('p_first_name', request.data.get('first_name', profile.first_name or ''))).strip()
        middle_name = str(request.data.get('p_middle_name', request.data.get('middle_name', profile.middle_name or ''))).strip()
        last_name = str(request.data.get('p_last_name', request.data.get('last_name', profile.last_name or ''))).strip()
        email = str(request.data.get('p_email', request.data.get('email', profile.email or ''))).strip().lower()
        phone = str(request.data.get('p_phone', request.data.get('phone', profile.phone or ''))).strip()
        national_id = str(request.data.get('p_national_id', request.data.get('national_id', profile.national_id or ''))).strip()
        document_type = str(request.data.get('p_document_type', request.data.get('document_type', profile.id_document_type or 'national_id'))).strip().lower()
        document_url = str(request.data.get('p_document_url', request.data.get('document_url', profile.id_document_url or ''))).strip()

        if not first_name or not last_name:
            return Response({'success': False, 'code': 'NAME_REQUIRED', 'message': 'First name and last name are required.'}, status=400)
        if email != str(profile.email or '').strip().lower():
            return Response({'success': False, 'code': 'EMAIL_CHANGE_NOT_ALLOWED', 'message': 'Your verified account email cannot be changed during this application.'}, status=400)
        if not phone:
            return Response({'success': False, 'code': 'PHONE_REQUIRED', 'message': 'A phone number is required.'}, status=400)
        if not national_id:
            return Response({'success': False, 'code': 'IDENTITY_NUMBER_REQUIRED', 'message': 'Your National ID or Passport number is required.'}, status=400)
        if document_type not in {'national_id', 'passport'}:
            return Response({'success': False, 'code': 'INVALID_DOCUMENT_TYPE', 'message': 'Please select a valid identity document type.'}, status=400)
        if document_type == 'national_id' and (not national_id.isdigit() or not 7 <= len(national_id) <= 8):
            return Response({'success': False, 'code': 'INVALID_NATIONAL_ID', 'message': 'National ID must contain 7-8 digits.'}, status=400)

        document_bucket = document_url.split('/', 1)[0] if document_url else ''
        if (
            document_bucket not in ALLOWED_ID_DOCUMENT_BUCKETS
            or not document_url.startswith(f'{document_bucket}/{profile.pk}/')
            or '..' in Path(document_url).parts
            or not default_storage.exists(document_url)
        ):
            return Response({'success': False, 'code': 'DOCUMENT_REQUIRED', 'message': 'Please upload or complete your identity document before submitting.'}, status=400)

        profile.first_name = first_name
        profile.middle_name = middle_name
        profile.last_name = last_name
        profile.phone = phone
        profile.national_id = national_id
        profile.id_document_type = document_type
        profile.id_document_url = document_url
        setattr(profile, status_field, 'pending')
        if role == 'real_estate':
            profile.is_agency = True
        profile.updated_at = timezone.now()
        update_fields = [
            'first_name', 'middle_name', 'last_name', 'phone', 'national_id',
            'id_document_type', 'id_document_url', status_field, 'updated_at',
        ]
        if role == 'real_estate':
            update_fields.append('is_agency')
        profile.save(update_fields=update_fields)

        full_name = ' '.join(part for part in (first_name, middle_name, last_name) if part)
        application = {
            'application_id': str(profile.id),
            'id': str(profile.id),
            'applicant_id': str(profile.id),
            'applicant_name': full_name,
            'full_name': full_name,
            'applicant_email': profile.email,
            'email': profile.email,
            'phone': phone,
            'national_id': national_id,
            'document_type': document_type,
            'document_url': document_url,
            'application_type': application_type,
            'status': 'pending',
            'submitted_at': timezone.localtime().strftime('%d %b %Y, %H:%M %Z'),
        }

        notification_status = {'applicant_queued': False, 'admin_queued': False}
        applicant_template = 'landlord_application_submitted' if role == 'landlord' else 'real_estate_application_submitted'
        admin_template = 'landlord_admin_notification' if role == 'landlord' else 'real_estate_admin_notification'
        try:
            queue_email(recipient=profile.email, template_type=applicant_template, payload=application)
            notification_status['applicant_queued'] = True
        except Exception:
            logger.exception('Failed to queue %s applicant notification for %s', display_role, profile.email)

        admin_email = str(getattr(settings, 'ADMIN_EMAIL', '') or '').strip().lower()
        if admin_email:
            try:
                queue_email(recipient=admin_email, template_type=admin_template, payload=application)
                notification_status['admin_queued'] = True
            except Exception:
                logger.exception('Failed to queue %s admin notification for %s', display_role, profile.email)
        else:
            logger.error('ADMIN_EMAIL is not configured; %s admin notification was not queued', display_role)

        return Response({
            'success': True,
            'code': 'SUBMITTED',
            'message': f'Your {display_role} application has been submitted for review.',
            'profile': ProfileSerializer(profile).data,
            'notifications': notification_status,
        }, status=200)
