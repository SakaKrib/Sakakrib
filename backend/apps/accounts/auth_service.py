import secrets
from datetime import timedelta

from django.contrib.auth.hashers import check_password, make_password
from django.db import transaction
from django.utils import timezone

from apps.core.email_services import queue_email

from .models import Profile

OTP_EXPIRY_MINUTES = 10
OTP_RESEND_SECONDS = 60
OTP_MAX_ATTEMPTS = 5
VERIFICATION_WINDOW_HOURS = 24
OTP_ACCOUNT_CLEANUP_DELAY_SECONDS = 180


def generate_signup_otp():
    return f'{secrets.randbelow(1_000_000):06d}'


def send_signup_otp(user: Profile, *, now=None):
    now = now or timezone.now()
    if user.signup_otp_last_sent_at:
        elapsed = (now - user.signup_otp_last_sent_at).total_seconds()
        if elapsed < OTP_RESEND_SECONDS:
            raise ValueError('Please wait before requesting another verification code.')

    is_first_verification_send = user.signup_verification_started_at is None
    otp = generate_signup_otp()
    user.signup_otp_hash = make_password(otp)
    user.signup_otp_expires_at = now + timedelta(minutes=OTP_EXPIRY_MINUTES)
    user.signup_otp_attempts = 0
    user.signup_otp_last_sent_at = now
    if is_first_verification_send:
        user.signup_verification_started_at = now
        user.signup_verification_deadline_at = now + timedelta(hours=VERIFICATION_WINDOW_HOURS)
    user.save(update_fields=[
        'signup_otp_hash', 'signup_otp_expires_at', 'signup_otp_attempts',
        'signup_otp_last_sent_at', 'signup_verification_started_at',
        'signup_verification_deadline_at', 'updated_at',
    ])

    # Queue the OTP with the same Django email infrastructure used by the rest
    # of the platform. The OTP itself is only rendered into the email body and
    # the database stores only its password hash.
    queue_email(
        recipient=user.email,
        template_type='otp_verification',
        payload={
            'full_name': user.full_name,
            'email': user.email,
            'otp': otp,
            'purpose': 'verify your Saka Krib account',
        },
    )

    # Start the three-minute cleanup clock after the email queue row is safely
    # part of the surrounding transaction. The task re-checks email_verified
    # before deleting anything.
    if is_first_verification_send:
        from .tasks import delete_unverified_account_after_3_minutes

        transaction.on_commit(
            lambda: delete_unverified_account_after_3_minutes.apply_async(
                args=[str(user.id)],
                countdown=OTP_ACCOUNT_CLEANUP_DELAY_SECONDS,
            )
        )


def verify_signup_otp(user: Profile, otp: str, *, now=None):
    now = now or timezone.now()
    if user.email_verified:
        return user
    if user.signup_verification_deadline_at and now > user.signup_verification_deadline_at:
        raise ValueError('The email verification window has expired. Please contact support.')
    if not user.signup_otp_hash or not user.signup_otp_expires_at:
        raise ValueError('No active verification code. Please request a new code.')
    if now > user.signup_otp_expires_at:
        raise ValueError('The verification code has expired.')
    if user.signup_otp_attempts >= OTP_MAX_ATTEMPTS:
        raise ValueError('Too many verification attempts. Please request a new code.')

    if not check_password(otp, user.signup_otp_hash):
        user.signup_otp_attempts += 1
        user.save(update_fields=['signup_otp_attempts', 'updated_at'])
        raise ValueError('Invalid verification code.')

    user.email_verified = True
    user.signup_otp_verified_at = now
    user.signup_otp_hash = None
    user.signup_otp_expires_at = None
    user.signup_otp_attempts = 0
    user.save(update_fields=[
        'email_verified', 'signup_otp_verified_at', 'signup_otp_hash',
        'signup_otp_expires_at', 'signup_otp_attempts', 'updated_at',
    ])
    return user
