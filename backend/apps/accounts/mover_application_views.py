from datetime import date, datetime
from pathlib import Path
import logging

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.domain_platform import MoverApplication
from apps.core.email_services import queue_email

from .models import Profile
from .serializers import ProfileSerializer

logger = logging.getLogger(__name__)


class MoverApplicationSubmitView(APIView):
    """Django replacement for the legacy submit_mover_application RPC."""

    permission_classes = [IsAuthenticated]

    # These are the fields owned by the mover application form. Server-managed
    # and admin-review fields are intentionally excluded from applicant input.
    FORM_FIELDS = {
        'applicant_email', 'applicant_name', 'application_type',
        'base_rate_kes', 'capacity_details', 'dl_number', 'dl_photo_url',
        'driver_full_name', 'end_time', 'insurance_policy_details',
        'latitude', 'liability_accepted', 'location', 'longitude',
        'national_id', 'number_plate', 'operating_city', 'operating_county',
        'payment_account', 'payment_channel', 'phone', 'rate_per_km_kes',
        'reference_contacts', 'start_time', 'submitted_at', 'terms_accepted',
        'vehicle_inspection_expiry', 'vehicle_type', 'working_days',
    }
    ADMIN_FIELDS = {'status', 'reviewed_by', 'reviewed_at', 'review_notes', 'admin_review_note'}

    @staticmethod
    def _as_bool(value):
        return value is True or str(value).strip().lower() in {'true', '1', 'yes', 'on'}

    @staticmethod
    def _as_float(value, field):
        try:
            number = float(value)
        except (TypeError, ValueError):
            raise ValueError(f'{field} must be a valid number.')
        if field == 'latitude':
            valid = -90 <= number <= 90
        else:
            valid = -180 <= number <= 180
        if not valid:
            raise ValueError(f'{field} is outside the valid range.')
        return number

    @staticmethod
    def _as_date(value):
        try:
            return date.fromisoformat(str(value).strip())
        except (TypeError, ValueError):
            raise ValueError('Vehicle inspection expiration date is invalid.')

    @staticmethod
    def _as_time(value, field):
        try:
            return datetime.strptime(str(value).strip(), '%H:%M').time()
        except (TypeError, ValueError):
            raise ValueError(f'{field} must be a valid time in HH:MM format.')

    @staticmethod
    def _document_owned(path, user_id):
        value = str(path or '').strip()
        return bool(value) and value.startswith(f'licenses/{user_id}/') and '..' not in Path(value).parts

    @staticmethod
    def _serialize(application):
        # Applicant-facing representation: form fields plus application
        # identity/current status. Admin review fields are never exposed here.
        return {
            'id': str(application.id),
            'applicant_email': application.applicant_email,
            'applicant_name': application.applicant_name,
            'application_type': application.application_type,
            'base_rate_kes': application.base_rate_kes,
            'capacity_details': application.capacity_details,
            'dl_number': application.dl_number,
            'dl_photo_url': application.dl_photo_url,
            'driver_full_name': application.driver_full_name,
            'end_time': application.end_time.strftime('%H:%M') if application.end_time else None,
            'insurance_policy_details': application.insurance_policy_details,
            'latitude': application.latitude,
            'liability_accepted': application.liability_accepted,
            'location': application.location,
            'longitude': application.longitude,
            'national_id': application.national_id,
            'number_plate': application.number_plate,
            'operating_city': application.operating_city,
            'operating_county': application.operating_county,
            'payment_account': application.payment_account,
            'payment_channel': application.payment_channel,
            'phone': application.phone,
            'rate_per_km_kes': application.rate_per_km_kes,
            'reference_contacts': application.reference_contacts,
            'start_time': application.start_time.strftime('%H:%M') if application.start_time else None,
            'terms_accepted': application.terms_accepted,
            'vehicle_inspection_expiry': application.vehicle_inspection_expiry,
            'vehicle_type': application.vehicle_type,
            'working_days': application.working_days,
            'status': application.status,
            'submitted_at': application.submitted_at,
        }

    def get(self, request):
        application = MoverApplication.objects.filter(applicant_id=request.user.pk).order_by('-created_at').first()
        if not application:
            return Response({'application': None}, status=200)
        return Response({'application': self._serialize(application)}, status=200)

    @transaction.atomic
    def post(self, request):
        profile = Profile.objects.select_for_update().get(pk=request.user.pk)

        if profile.role != 'mover':
            return Response({'success': False, 'code': 'INVALID_ROLE', 'message': 'Your account is not registered as a mover.'}, status=400)
        if not profile.email_verified:
            return Response({'success': False, 'code': 'EMAIL_NOT_VERIFIED', 'message': 'Please verify your email before applying.'}, status=403)
        if not profile.kyc_completed:
            return Response({'success': False, 'code': 'KYC_REQUIRED', 'message': 'Please complete identity verification before applying.'}, status=403)

        current = str(profile.mover_application_status or 'not_requested').lower()
        if current == 'pending':
            return Response({'success': False, 'code': 'MOVER_APPLICATION_ALREADY_PENDING', 'message': 'Your mover application is already pending review.'}, status=409)
        if current == 'approved':
            return Response({'success': False, 'code': 'MOVER_ALREADY_APPROVED', 'message': 'Your mover application has already been approved.'}, status=409)

        application = request.data.get('p_application')
        if not isinstance(application, dict):
            return Response({'success': False, 'code': 'INVALID_APPLICATION_DATA', 'message': 'Mover application data is required.'}, status=400)

        submitted_keys = set(application.keys())
        admin_fields = submitted_keys & self.ADMIN_FIELDS
        if admin_fields:
            return Response({
                'success': False,
                'code': 'INVALID_APPLICATION_FIELDS',
                'message': 'Admin review fields cannot be submitted with a mover application.',
                'fields': sorted(admin_fields),
            }, status=400)

        unexpected_fields = submitted_keys - self.FORM_FIELDS
        if unexpected_fields:
            return Response({
                'success': False,
                'code': 'INVALID_APPLICATION_FIELDS',
                'message': 'Only mover application form fields are accepted.',
                'fields': sorted(unexpected_fields),
            }, status=400)

        try:
            full_name = str(application.get('driver_full_name') or '').strip()
            national_id = str(application.get('national_id') or '').strip()
            dl_number = str(application.get('dl_number') or '').strip()
            dl_photo_url = str(application.get('dl_photo_url') or '').strip()
            vehicle_type = str(application.get('vehicle_type') or '').strip().lower()
            number_plate = str(application.get('number_plate') or '').strip().upper()
            capacity_details = str(application.get('capacity_details') or '').strip()
            operating_city = str(application.get('operating_city') or '').strip()
            operating_county = str(application.get('operating_county') or '').strip()
            phone = str(application.get('phone') or '').strip()
            payment_channel = str(application.get('payment_channel') or '').strip().lower()
            payment_account = str(application.get('payment_account') or '').strip()
            insurance_details = str(application.get('insurance_policy_details') or '').strip()
            inspection_expiry = self._as_date(application.get('vehicle_inspection_expiry'))
            liability_accepted = self._as_bool(application.get('liability_accepted'))
            terms_accepted = self._as_bool(application.get('terms_accepted'))
            references = application.get('reference_contacts')
            working_days = application.get('working_days')
            start_time = self._as_time(application.get('start_time'), 'start_time')
            end_time = self._as_time(application.get('end_time'), 'end_time')

            if not full_name or len(full_name.split()) < 2:
                raise ValueError('First name and last name are required.')
            if not national_id.isdigit() or not 7 <= len(national_id) <= 8:
                raise ValueError('National ID must be 7-8 digits.')
            if not dl_number:
                raise ValueError('A valid driving license number is required.')
            if not self._document_owned(dl_photo_url, profile.pk):
                raise ValueError('Please upload your driving license photo before submitting.')
            if vehicle_type not in {'pickup', 'lorry', 'trailer'}:
                raise ValueError('Please select a valid vehicle type.')
            if not number_plate:
                raise ValueError('Vehicle number plate is required.')
            if not capacity_details:
                raise ValueError('Please provide your vehicle capacity details before submitting your mover application.')
            if not operating_city or not operating_county:
                raise ValueError('Operating city and county are required.')
            if not phone:
                raise ValueError('A phone number is required.')
            if payment_channel not in {'mpesa_send_money', 'mpesa_paybill', 'mpesa_lipa_na_mpesa', 'airtel_money'}:
                raise ValueError('Please select a valid payment channel.')
            if not payment_account:
                raise ValueError('A payout account is required.')
            if not insurance_details:
                raise ValueError('Insurance policy details are required.')
            if inspection_expiry < timezone.localdate():
                raise ValueError('Vehicle inspection must not already be expired.')
            if not liability_accepted:
                raise ValueError('You must accept full liability for goods in transit.')
            if not terms_accepted:
                raise ValueError('Please accept the Mover Terms and Conditions before submitting your application.')
            if not isinstance(references, list) or not references:
                raise ValueError('Add at least one representative reference contact.')
            if not isinstance(working_days, list) or not working_days:
                raise ValueError('Select at least one working day before submitting.')
            if end_time <= start_time:
                raise ValueError('End time must be later than the start time.')

            latitude = self._as_float(application.get('latitude'), 'latitude')
            longitude = self._as_float(application.get('longitude'), 'longitude')
            location = str(application.get('location') or '').strip()
            if not location:
                raise ValueError('Please provide the location returned by GPS.')

            base_rate = application.get('base_rate_kes') or 0
            rate_per_km = application.get('rate_per_km_kes') or 0
            if float(base_rate) < 0 or float(rate_per_km) < 0:
                raise ValueError('Rates must be valid non-negative amounts.')
        except ValueError as exc:
            return Response({'success': False, 'code': 'INVALID_APPLICATION_DATA', 'message': str(exc)}, status=400)
        except Exception:
            logger.exception('Unexpected mover application validation error for %s', profile.pk)
            return Response({'success': False, 'code': 'INVALID_APPLICATION_DATA', 'message': 'Some of the information in your application is invalid. Please review the form and try again.'}, status=400)

        existing = MoverApplication.objects.filter(applicant_id=profile.pk, status__in=['pending', 'approved']).first()
        if existing:
            if existing.status == 'approved':
                return Response({'success': False, 'code': 'MOVER_ALREADY_APPROVED', 'message': 'Your mover application has already been approved.'}, status=409)
            return Response({'success': False, 'code': 'MOVER_APPLICATION_ALREADY_PENDING', 'message': 'Your mover application is already pending review.'}, status=409)

        submitted_at = timezone.now()
        mover_application = MoverApplication.objects.create(
            applicant_id=profile.pk,
            applicant_email=profile.email,
            applicant_name=full_name,
            application_type='mover',
            driver_full_name=full_name,
            national_id=national_id,
            dl_number=dl_number,
            dl_photo_url=dl_photo_url,
            vehicle_type=vehicle_type,
            number_plate=number_plate,
            capacity_details=capacity_details,
            operating_city=operating_city,
            operating_county=operating_county,
            phone=phone,
            base_rate_kes=base_rate,
            rate_per_km_kes=rate_per_km,
            payment_channel=payment_channel,
            payment_account=payment_account,
            insurance_policy_details=insurance_details,
            vehicle_inspection_expiry=inspection_expiry,
            liability_accepted=liability_accepted,
            terms_accepted=terms_accepted,
            reference_contacts=references,
            working_days=working_days,
            start_time=start_time,
            end_time=end_time,
            status='pending',
            submitted_at=submitted_at,
            latitude=latitude,
            longitude=longitude,
            location=location,
        )

        profile.mover_application_status = 'pending'
        profile.first_name = full_name.split()[0]
        profile.last_name = full_name.split()[-1]
        profile.middle_name = ' '.join(full_name.split()[1:-1])
        profile.phone = phone
        profile.national_id = national_id
        profile.updated_at = submitted_at
        profile.save(update_fields=[
            'mover_application_status', 'first_name', 'middle_name', 'last_name',
            'phone', 'national_id', 'updated_at',
        ])

        payload = {
            **application,
            'application_id': str(mover_application.id),
            'id': str(mover_application.id),
            'applicant_id': str(profile.id),
            'applicant_name': full_name,
            'full_name': full_name,
            'applicant_email': profile.email,
            'email': profile.email,
            'application_type': 'mover',
            'status': 'pending',
            'submitted_at': timezone.localtime(submitted_at).strftime('%d %b %Y, %H:%M %Z'),
        }

        notifications = {'applicant_queued': False, 'admin_queued': False}
        try:
            queue_email(recipient=profile.email, template_type='mover_application_submitted', payload=payload)
            notifications['applicant_queued'] = True
        except Exception:
            logger.exception('Failed to queue mover applicant notification for %s', profile.email)

        admin_email = str(getattr(settings, 'ADMIN_EMAIL', '') or '').strip().lower()
        if admin_email:
            try:
                queue_email(recipient=admin_email, template_type='mover_admin_notification', payload=payload)
                notifications['admin_queued'] = True
            except Exception:
                logger.exception('Failed to queue mover admin notification for %s', profile.email)
        else:
            logger.error('ADMIN_EMAIL is not configured; mover admin notification was not queued')

        return Response({
            'success': True,
            'code': 'SUBMITTED',
            'status': 'pending',
            'message': 'Your mover application has been submitted for review.',
            'mover_id': str(mover_application.id),
            'profile_id': str(profile.id),
            'application': self._serialize(mover_application),
            'profile': ProfileSerializer(profile).data,
            'notifications': notifications,
        }, status=200)
