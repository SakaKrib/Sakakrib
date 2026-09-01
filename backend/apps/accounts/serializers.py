from rest_framework import serializers

from .models import Profile


class ProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = Profile
        fields = [
            'id',
            'email',
            'full_name',
            'is_admin',
            'first_name',
            'last_name',
            'middle_name',
            'role',
            'kyc_completed',
            'verification_status',
            'landlord_application_status',
            'real_estate_application_status',
            'mover_application_status',
            'national_id',
            'dl_number',
            'phone',
            'profile_photo_url',
            'id_photo_url',
            'selfie_url',
            'id_document_url',
            'id_document_type',
            'city',
            'county',
            'is_agency',
            'free_listings_used',
            'created_at',
            'updated_at',
            'email_verified',
            'admin_review_note',
        ]
        read_only_fields = fields
