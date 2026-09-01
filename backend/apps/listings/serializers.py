from rest_framework import serializers
from .models import Listing


class ListingSerializer(serializers.ModelSerializer):
    class Meta:
        model = Listing
        fields = [
            'id', 'user_id', 'title', 'description', 'city', 'county', 'location_search',
            'latitude', 'longitude', 'property_name', 'property_type', 'price_kes',
            'listing_type', 'deposit_required', 'deposit_structure', 'deposit_amount',
            'size', 'beds', 'baths', 'contact_phone', 'contact_email', 'social_links',
            'booking_enabled', 'payment_enabled', 'is_property_management', 'is_paid',
            'is_published', 'approval_status', 'is_approved', 'status', 'admin_reviewed_at',
            'admin_review_note', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'user_id', 'is_paid', 'is_published', 'approval_status', 'is_approved', 'status', 'admin_reviewed_at', 'admin_review_note', 'created_at', 'updated_at']


class ListingCreateSerializer(serializers.Serializer):
    title = serializers.CharField(required=False, allow_blank=True)
    description = serializers.CharField(required=False, allow_blank=True)
    city = serializers.CharField(required=False, allow_blank=True)
    county = serializers.CharField(required=False, allow_blank=True)
    location_search = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    latitude = serializers.FloatField(required=False, allow_null=True)
    longitude = serializers.FloatField(required=False, allow_null=True)
    property_name = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    property_type = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    price_kes = serializers.DecimalField(max_digits=14, decimal_places=2, required=False, allow_null=True)
    listing_type = serializers.CharField(required=False)
    deposit_required = serializers.BooleanField(required=False)
    deposit_structure = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    deposit_amount = serializers.DecimalField(max_digits=14, decimal_places=2, required=False)
    size = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    beds = serializers.IntegerField(required=False, min_value=0)
    baths = serializers.IntegerField(required=False, min_value=0)
    contact_phone = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    contact_email = serializers.EmailField(required=False, allow_null=True, allow_blank=True)
    social_links = serializers.JSONField(required=False)
    booking_enabled = serializers.BooleanField(required=False)
    payment_enabled = serializers.BooleanField(required=False)
    is_property_management = serializers.BooleanField(required=False)
