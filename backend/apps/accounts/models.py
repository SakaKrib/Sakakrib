from django.contrib.auth.base_user import BaseUserManager
from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.db import models
from django.utils import timezone
import uuid


class ProfileManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("The email address is required")
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("is_active", True)
        extra_fields.setdefault("role", "admin")
        if not extra_fields.get("is_staff") or not extra_fields.get("is_superuser"):
            raise ValueError("Superuser must have is_staff=True and is_superuser=True")
        return self.create_user(email, password, **extra_fields)


class Profile(AbstractBaseUser, PermissionsMixin):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True)
    full_name = models.CharField(max_length=255, blank=True, default="")
    phone = models.CharField(max_length=50, blank=True, default="")
    role = models.CharField(max_length=50, default="renter")

    verification_status = models.CharField(max_length=50, default="unverified")
    kyc_status = models.CharField(max_length=50, default="pending")

    role_selected_at = models.DateTimeField(null=True, blank=True)
    signup_otp_hash = models.TextField(null=True, blank=True)
    signup_otp_expires_at = models.DateTimeField(null=True, blank=True)
    signup_otp_attempts = models.IntegerField(default=0)
    signup_otp_last_sent_at = models.DateTimeField(null=True, blank=True)
    signup_otp_verified_at = models.DateTimeField(null=True, blank=True)
    signup_otp_encrypted = models.TextField(null=True, blank=True)
    signup_otp_trial_count = models.IntegerField(default=0)
    signup_verification_started_at = models.DateTimeField(null=True, blank=True)
    signup_verification_deadline_at = models.DateTimeField(null=True, blank=True)

    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    objects = ProfileManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    class Meta:
        db_table = "profiles"
        indexes = [
            models.Index(fields=["role"]),
            models.Index(fields=["verification_status"]),
            models.Index(fields=["kyc_status"]),
        ]

    def __str__(self):
        return self.email
