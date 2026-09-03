from html import escape
from urllib.parse import quote

from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils import timezone
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.domain_platform import NotificationEmail

from .models import Profile


def _frontend_url(request, redirect_to=None):
    configured = str(getattr(settings, 'FRONTEND_URL', '') or '').rstrip('/')
    fallback = configured or request.build_absolute_uri('/').rstrip('/')
    candidate = str(redirect_to or fallback).strip()
    if candidate.startswith(fallback):
        return candidate.rstrip('/')
    return fallback


def _reset_email(user, reset_url):
    first_name = escape((user.full_name or user.email).split()[0])
    html = f"""<!doctype html><html><body style='font-family:Arial,sans-serif;background:#f6f7f9;padding:30px'><div style='max-width:600px;margin:auto;background:#fff;border-radius:16px;padding:30px'><h1 style='color:#255d3a'>Saka Krib</h1><h2>Password reset</h2><p>Hello {first_name},</p><p>We received a request to reset your Saka Krib password. Use the button below to choose a new password.</p><p><a href='{escape(reset_url)}' style='display:inline-block;padding:14px 24px;background:#255d3a;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold'>Reset password</a></p><p style='color:#666;font-size:13px'>If you did not request this, you can ignore this email.</p></div></body></html>"""
    return NotificationEmail.objects.create(
        recipient=user.email,
        subject='Reset your Saka Krib password',
        html_body=html,
        template_type='password_reset',
        status='pending',
        created_at=timezone.now(),
    )


class PasswordResetRequestView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = str(request.data.get('email') or '').strip().lower()
        redirect_to = request.data.get('redirect_to')
        user = Profile.objects.filter(email__iexact=email, is_active=True).first() if email else None

        # Always return the same response so account existence is not disclosed.
        if user:
            uid = urlsafe_base64_encode(str(user.pk).encode())
            token = default_token_generator.make_token(user)
            base = _frontend_url(request, redirect_to)
            reset_url = f"{base}/reset-password?uid={quote(uid)}&token={quote(token)}"
            _reset_email(user, reset_url)

        return Response({'success': True, 'message': 'If an account exists for that email, a password reset link has been sent.'}, status=202)


class PasswordResetConfirmView(APIView):
    permission_classes = [AllowAny]

    @transaction.atomic
    def post(self, request):
        uid = str(request.data.get('uid') or '')
        token = str(request.data.get('token') or '')
        password = str(request.data.get('password') or '')
        if not uid or not token or not password:
            return Response({'error': 'uid, token and password are required.'}, status=400)
        try:
            user_id = urlsafe_base64_decode(uid).decode()
            user = Profile.objects.select_for_update().get(pk=user_id, is_active=True)
        except (ValueError, TypeError, Profile.DoesNotExist):
            return Response({'error': 'The password reset link is invalid or expired.'}, status=400)
        if not default_token_generator.check_token(user, token):
            return Response({'error': 'The password reset link is invalid or expired.'}, status=400)
        try:
            validate_password(password, user)
        except DjangoValidationError as exc:
            return Response({'error': ' '.join(exc.messages)}, status=400)
        user.set_password(password)
        user.updated_at = timezone.now()
        user.save(update_fields=['password', 'updated_at'])
        return Response({'success': True, 'message': 'Your password has been reset. You can now sign in.'})
