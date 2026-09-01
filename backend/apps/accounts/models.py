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
        extra_fields.setdefault("is_admin", True)
        extra_fields.setdefault("role", "admin")
        if not extra_fields.get("is_staff") or not extra_fields.get("is_superuser"):
            raise ValueError("Superuser must have is_staff=True and is_superuser=True")
        return self.create_user(email, password, **extra_fields)


class Profile(AbstractBaseUser, PermissionsMixin):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True)
    full_name = models.CharField(max_length=255, blank=True, default="")
    first_name = models.CharField(max_length=150, blank=True, default="")
    last_name = models.CharField(max_length=150, blank=True, default="")
    middle_name = models.CharField(max_length=150, blank=True, default="")
    phone = models.CharField(max_length=50, blank=True, default="")
    role = models.CharField(max_length=50, default="renter")

    is_admin = models.BooleanField(default=False)
    kyc_completed = models.BooleanField(default=False)
    verification_status = models.CharField(max_length=50, default="pending_verification")
    kyc_status = models.CharField(max_length=50, default="pending")
    landlord_application_status = models.CharField(max_length=50, default="not_requested")
    real_estate_application_status = models.CharField(max_length=50, default="not_requested")
    mover_application_status = models.CharField(max_length=50, default="not_requested")

    national_id = models.CharField(max_length=100, blank=True, default="")
    dl_number = models.CharField(max_length=100, blank=True, default="")
    profile_photo_url = models.TextField(blank=True, default="")
    id_photo_url = models.TextField(blank=True, default="")
    selfie_url = models.TextField(blank=True, default="")
    id_document_url = models.TextField(blank=True, default="")
    id_document_type = models.CharField(max_length=30, blank=True, default="")
    city = models.CharField(max_length=150, blank=True, default="")
    county = models.CharField(max_length=150, blank=True, default="")
    is_agency = models.BooleanField(default=False)
    free_listings_used = models.PositiveIntegerField(default=0)
    email_verified = models.BooleanField(default=False)
    admin_review_note = models.TextField(blank=True, default="")

    role_selected_at = models.DateTimeField(null=True, blank=True)
    signup_otp_hash = models.TextField(null=True, blank=True)
    signup_otp_expires_at = models.DateTimeField(null=True, blank=True)
    signup_otp_attempts = models.PositiveIntegerField(default=0)
    signup_otp_last_sent_at = models.DateTimeField(null=True, blank=True)
    signup_otp_verified_at = models.DateTimeField(null=True, blank=True)
    signup_otp_encrypted = models.TextField(null=True, blank=True)
    signup_otp_trial_count = models.PositiveIntegerField(default=0)
    signup_verification_started_at = models.DateTimeField(null=True, blank=True)
    signup_verification_deadline_at = models.DateTimeField(null=True, blank=True)

    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = ProfileManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    class Meta:
        db_table = "profiles"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["role"]),
            models.Index(fields=["verification_status"]),
            models.Index(fields=["kyc_status"]),
        ]

    def __str__(self):
        return self.email
