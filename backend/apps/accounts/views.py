import logging

from django.conf import settings
from django.contrib.auth.models import update_last_login
from django.db import transaction
from django.http import JsonResponse
from django.middleware.csrf import get_token
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.email_services import queue_email

from .auth_service import send_signup_otp, verify_signup_otp
from .jwt_service import clear_auth_cookies, issue_token_pair, revoke_refresh_token, rotate_refresh_token, set_auth_cookies
from .models import Profile
from .serializers import LoginSerializer, ProfileSerializer, ResendOtpSerializer, SetRoleSerializer, SignupSerializer, VerifyOtpSerializer


def _otp_state(user):
    expires_at = user.signup_otp_expires_at
    expires_in = max(0, int((expires_at - timezone.now()).total_seconds())) if expires_at else 0
    return {
        'signup_attempt': user.signup_otp_trial_count,
        'otp_expires_at': expires_at.isoformat() if expires_at else None,
        'otp_expires_in': expires_in,
    }


class CsrfTokenView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return JsonResponse({'csrfToken': get_token(request)})


class SignupView(APIView):
    permission_classes = [AllowAny]

    @transaction.atomic
    def post(self, request):
        serializer = SignupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['email'].strip().lower()
        password = serializer.validated_data['password']
        full_name = serializer.validated_data.get('fullName', '').strip()
        existing = Profile.objects.filter(email__iexact=email).first()
        if existing:
            if existing.email_verified:
                return Response({'error': 'An account with this email already exists.'}, status=status.HTTP_409_CONFLICT)
            try:
                send_signup_otp(existing)
            except ValueError as exc:
                return Response({'error': str(exc)}, status=status.HTTP_429_TOO_MANY_REQUESTS)
            return Response({'success': True, 'requiresEmailVerification': True, 'email': existing.email, **_otp_state(existing)}, status=status.HTTP_200_OK)
        user = Profile.objects.create_user(email=email, password=password, full_name=full_name, email_verified=False, verification_status='pending_verification', kyc_status='pending')
        try:
            send_signup_otp(user)
        except Exception:
            user.delete()
            raise
        return Response({'success': True, 'requiresEmailVerification': True, 'email': user.email, 'profile_id': str(user.id), **_otp_state(user)}, status=status.HTTP_201_CREATED)


class ResendOtpView(APIView):
    permission_classes = [AllowAny]

    @transaction.atomic
    def post(self, request):
        serializer = ResendOtpSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['email'].strip().lower()
        user = Profile.objects.filter(email__iexact=email, is_active=True).first()
        if not user:
            return Response({'error': 'Unable to resend verification code.'}, status=status.HTTP_400_BAD_REQUEST)
        if user.email_verified:
            return Response({'success': True, 'authenticated': True, 'message': 'Email is already verified.'})
        if user.verification_status != 'pending_verification':
            return Response({'error': 'This verification request is no longer active.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            send_signup_otp(user)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_429_TOO_MANY_REQUESTS)
        return Response({'success': True, 'requiresEmailVerification': True, 'email': user.email, **_otp_state(user)}, status=status.HTTP_200_OK)


class VerifyOtpView(APIView):
    permission_classes = [AllowAny]

    @transaction.atomic
    def post(self, request):
        serializer = VerifyOtpSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['email'].strip().lower()
        user = Profile.objects.filter(email__iexact=email).first()
        if not user:
            return Response({'error': 'Invalid verification request.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            verify_signup_otp(user, serializer.validated_data['otp'])
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        access, refresh = issue_token_pair(user)
        response = Response({'success': True, 'authenticated': True, 'user': {'id': str(user.id), 'email': user.email}, 'profile': ProfileSerializer(user).data})
        set_auth_cookies(response, access, refresh)
        return response


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['email'].strip().lower()
        password = serializer.validated_data['password']
        from django.contrib.auth.hashers import check_password
        user = Profile.objects.filter(email__iexact=email).first()
        if not user or not check_password(password, user.password):
            return Response({'error': 'Invalid email or password.'}, status=status.HTTP_401_UNAUTHORIZED)
        if not user.is_active:
            return Response({'error': 'This account is inactive.'}, status=status.HTTP_403_FORBIDDEN)
        if not user.email_verified:
            return Response({'authenticated': False, 'requiresEmailVerification': True, 'email': user.email, 'profile_id': str(user.id), 'error': 'Please verify your email before signing in.'}, status=status.HTTP_403_FORBIDDEN)
        access, refresh = issue_token_pair(user)
        update_last_login(None, user)
        response = Response({'success': True, 'authenticated': True, 'user': {'id': str(user.id), 'email': user.email}, 'profile': ProfileSerializer(user).data})
        set_auth_cookies(response, access, refresh)

        try:
            queue_email(
                recipient=user.email,
                template_type='sign_in_notification',
                payload={
                    'email': user.email,
                    'full_name': user.full_name,
                    'sign_in_time': timezone.localtime().strftime('%d %b %Y, %H:%M %Z'),
                    'device': request.META.get('HTTP_USER_AGENT', 'Unknown device')[:255],
                    'location': request.META.get('REMOTE_ADDR', 'Unknown location'),
                    'security_url': 'https://sakakrib.com',
                },
            )
        except Exception:
            logging.getLogger(__name__).exception('Failed to queue sign-in notification for %s', user.email)

        return response


class RefreshView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        raw = request.COOKIES.get(settings.JWT_REFRESH_COOKIE)
        if not raw:
            return Response({'authenticated': False, 'error': 'Refresh token is required.'}, status=status.HTTP_401_UNAUTHORIZED)
        try:
            access, refresh = rotate_refresh_token(raw)
        except ValueError as exc:
            response = Response({'authenticated': False, 'error': str(exc)}, status=status.HTTP_401_UNAUTHORIZED)
            clear_auth_cookies(response)
            return response
        response = Response({'success': True, 'authenticated': True})
        set_auth_cookies(response, access, refresh)
        return response


class SessionView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        if not request.user.is_authenticated:
            return Response({'authenticated': False}, status=status.HTTP_200_OK)
        return Response({'authenticated': True, 'user': {'id': str(request.user.id), 'email': request.user.email}, 'profile': ProfileSerializer(request.user).data})


class SetRoleView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = SetRoleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if request.user.is_staff or request.user.is_superuser or request.user.is_admin:
            return Response({'error': 'Administrator role cannot be self-selected.'}, status=status.HTTP_403_FORBIDDEN)
        request.user.role = serializer.validated_data['role']
        request.user.role_selected_at = timezone.now()
        request.user.save(update_fields=['role', 'role_selected_at', 'updated_at'])
        return Response({'success': True, 'profile': ProfileSerializer(request.user).data})


class LogoutView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        raw = request.COOKIES.get(settings.JWT_REFRESH_COOKIE)
        if raw:
            revoke_refresh_token(raw)
        response = Response({'success': True, 'authenticated': False})
        clear_auth_cookies(response)
        return response


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(ProfileSerializer(request.user).data)

    def patch(self, request):
        allowed_fields = {
            'full_name', 'phone', 'city', 'county', 'profile_photo_url',
            'id_document_url', 'id_document_type', 'national_id',
        }
        updates = {key: request.data[key] for key in allowed_fields if key in request.data}
        if not updates:
            return Response({'detail': 'No supported profile fields were supplied.'}, status=status.HTTP_400_BAD_REQUEST)
        if 'full_name' in updates:
            updates['full_name'] = str(updates['full_name']).strip()
        for key in ('phone', 'city', 'county', 'id_document_url', 'id_document_type', 'national_id'):
            if key in updates:
                updates[key] = str(updates[key]).strip()
        with transaction.atomic():
            profile = Profile.objects.select_for_update().get(pk=request.user.pk)
            for key, value in updates.items():
                setattr(profile, key, value)
            profile.updated_at = timezone.now()
            profile.save(update_fields=[*updates.keys(), 'updated_at'])
        return Response(ProfileSerializer(profile).data)

    @transaction.atomic
    def delete(self, request):
        user = Profile.objects.select_for_update().get(pk=request.user.pk)
        user_id = str(user.id)
        user.delete()
        response = Response({'success': True, 'authenticated': False, 'deleted_user_id': user_id}, status=status.HTTP_200_OK)
        clear_auth_cookies(response)
        return response
