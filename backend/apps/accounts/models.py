import uuid

from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.db import models


class ProfileManager(BaseUserManager):
    use_in_migrations = True

    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError('Email is required')
        email = self.normalize_email(email).lower()
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('is_admin', True)
        extra_fields.setdefault('is_active', True)

        if extra_fields.get('is_staff') is not True:
            raise ValueError('Superuser must have is_staff=True')
        if extra_fields.get('is_superuser') is not True:
            raise ValueError('Superuser must have is_superuser=True')

        return self.create_user(email, password, **extra_fields)


class Profile(AbstractBaseUser, PermissionsMixin):
    """Django-owned authentication user and SakaCrib application profile."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True)

    full_name = models.CharField(max_length=255, blank=True, default='')
    first_name = models.CharField(max_length=150, blank=True, default='')
    last_name = models.CharField(max_length=150, blank=True, default='')
    middle_name = models.CharField(max_length=150, blank=True, default='')

    role = models.CharField(max_length=50, blank=True, default='')
    is_admin = models.BooleanField(default=False)

    kyc_completed = models.BooleanField(default=False)
    verification_status = models.CharField(max_length=50, default='unverified')
    landlord_application_status = models.CharField(max_length=50, default='not_requested')
    real_estate_application_status = models.CharField(max_length=50, default='not_requested')
    mover_application_status = models.CharField(max_length=50, default='not_requested')

    national_id = models.CharField(max_length=100, blank=True, default='')
    dl_number = models.CharField(max_length=100, blank=True, default='')
    phone = models.CharField(max_length=50, blank=True, default='')
    profile_photo_url = models.TextField(blank=True, default='')
    id_photo_url = models.TextField(blank=True, default='')
    selfie_url = models.TextField(blank=True, default='')
    id_document_url = models.TextField(blank=True, default='')
    id_document_type = models.CharField(max_length=30, blank=True, default='')
    city = models.CharField(max_length=150, blank=True, default='')
    county = models.CharField(max_length=150, blank=True, default='')
    is_agency = models.BooleanField(default=False)

    free_listings_used = models.PositiveIntegerField(default=0)
    email_verified = models.BooleanField(default=False)

    # Production signup-verification state. This replaces the old
    # Supabase Auth/Vault dependency while preserving the workflow.
    role_selected_at = models.DateTimeField(blank=True, null=True)
    signup_otp_hash = models.TextField(blank=True, null=True)
    signup_otp_expires_at = models.DateTimeField(blank=True, null=True)
    signup_otp_attempts = models.PositiveIntegerField(default=0)
    signup_otp_last_sent_at = models.DateTimeField(blank=True, null=True)
    signup_otp_verified_at = models.DateTimeField(blank=True, null=True)
    signup_otp_encrypted = models.TextField(blank=True, null=True)
    signup_otp_trial_count = models.PositiveIntegerField(default=0)
    signup_verification_started_at = models.DateTimeField(blank=True, null=True)
    signup_verification_deadline_at = models.DateTimeField(blank=True, null=True)

    admin_review_note = models.TextField(blank=True, default='')

    # Django authentication fields. These are required because Django owns
    # authentication after the Supabase migration.
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(auto_now_add=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = ProfileManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = []

    class Meta:
        db_table = 'profiles'
        ordering = ['-created_at']

    @property
    def profile(self):
        return self

    def get_full_name(self):
        return self.full_name or ' '.join(
            part for part in (self.first_name, self.middle_name, self.last_name) if part
        ).strip()

    def get_short_name(self):
        return self.first_name or self.email

    def __str__(self):
        return self.email
