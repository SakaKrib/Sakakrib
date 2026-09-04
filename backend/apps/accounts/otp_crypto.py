import base64
import hashlib

from cryptography.fernet import Fernet
from django.conf import settings


_OTP_ENCRYPTION_CONTEXT = b'sakakrib-signup-otp-v1'


def _fernet() -> Fernet:
    key = base64.urlsafe_b64encode(
        hashlib.sha256(
            settings.SECRET_KEY.encode('utf-8') + _OTP_ENCRYPTION_CONTEXT
        ).digest()
    )
    return Fernet(key)


def encrypt_signup_otp(otp: str) -> str:
    return _fernet().encrypt(otp.encode('utf-8')).decode('ascii')
