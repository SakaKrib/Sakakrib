from rest_framework import serializers

from .models import Profile


class ProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = Profile
        fields = [
            'id', 'email', 'role', 'verification_status',
            'landlord_application_status', 'real_estate_application_status',
            'mover_application_status', 'free_listings_used', 'created_at', 'updated_at',
        ]
        read_only_fields = fields
