from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from .models import Profile


class ProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = Profile
        fields = [
            'id', 'email', 'full_name', 'first_name', 'last_name', 'middle_name',
            'is_admin', 'is_staff', 'kyc_completed', 'verification_status',
            'kyc_status', 'landlord_application_status',
            'real_estate_application_status', 'mover_application_status',
            'national_id', 'dl_number', 'phone', 'profile_photo_url',
            'id_photo_url', 'selfie_url', 'id_document_url', 'id_document_type',
            'city', 'county', 'is_agency', 'free_listings_used',
            'created_at', 'updated_at', 'email_verified', 'admin_review_note',
            'role', 'role_selected_at',
        ]
        read_only_fields = fields


class SignupSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=8)
    fullName = serializers.CharField(required=False, allow_blank=True, max_length=255)

    def validate_password(self, value):
        validate_password(value)
        return value


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)


class VerifyOtpSerializer(serializers.Serializer):
    email = serializers.EmailField()
    otp = serializers.CharField(min_length=6, max_length=6, trim_whitespace=True)

    def validate_otp(self, value):
        if not value.isdigit():
            raise serializers.ValidationError('OTP must contain only digits.')
        return value


class SetRoleSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=['renter', 'landlord', 'mover', 'real_estate'])
