from rest_framework import serializers

from apps.accounts.models import Profile
from apps.core.domain_property import LandlordPaymentMethod, ListingMedia, PropertyUnit, RenterUnitAssociation
from apps.subscriptions.services import get_pms_access

from .models import Listing


class ListingMediaSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()

    class Meta:
        model = ListingMedia
        fields = ['id', 'listing_id', 'user_id', 'url', 'label', 'media_type', 'position', 'created_at', 'unit_id']
        read_only_fields = fields

    def get_url(self, obj):
        value = obj.url or ''
        if not value.startswith('django-media://'):
            return value
        return f'/api/listings/media/{obj.id}/'


class PropertyUnitPublicSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    listing_id = serializers.UUIDField()
    unit_number = serializers.CharField()
    unit_type = serializers.CharField()
    rent = serializers.DecimalField(max_digits=14, decimal_places=2)
    deposit_amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    size = serializers.CharField(allow_null=True)
    beds = serializers.IntegerField()
    baths = serializers.IntegerField()
    description = serializers.CharField(allow_null=True)
    position = serializers.IntegerField()
    status = serializers.CharField()
    media = serializers.ListField(child=serializers.DictField())


class ListingPaymentMethodPublicSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    provider = serializers.CharField()
    display_name = serializers.CharField()
    payment_method = serializers.CharField(allow_null=True)
    paybill_number = serializers.CharField(allow_null=True)
    paybill_account = serializers.CharField(allow_null=True)
    till_number = serializers.CharField(allow_null=True)
    paypal_email = serializers.EmailField(allow_null=True)
    is_default = serializers.BooleanField()


class ListingSerializer(serializers.ModelSerializer):
    media = serializers.SerializerMethodField()
    landlord = serializers.SerializerMethodField()
    units = serializers.SerializerMethodField()
    payment_methods = serializers.SerializerMethodField()

    class Meta:
        model = Listing
        fields = [
            'id', 'user_id', 'title', 'description', 'city', 'county', 'location_search',
            'latitude', 'longitude', 'property_name', 'property_type', 'price_kes',
            'listing_type', 'deposit_required', 'deposit_structure', 'deposit_amount',
            'size', 'beds', 'baths', 'contact_phone', 'contact_email', 'social_links',
            'booking_enabled', 'payment_enabled', 'is_property_management', 'is_paid',
            'is_draft', 'is_published', 'approval_status', 'is_approved', 'status', 'admin_reviewed_at',
            'admin_review_note', 'ai_caption', 'ai_caption_generated_at', 'created_at',
            'updated_at', 'media', 'landlord', 'units', 'payment_methods',
        ]
        read_only_fields = [
            'id', 'user_id', 'is_paid', 'is_draft', 'is_published', 'approval_status', 'is_approved',
            'status', 'admin_reviewed_at', 'admin_review_note', 'ai_caption',
            'ai_caption_generated_at', 'created_at', 'updated_at', 'media', 'landlord', 'units', 'payment_methods',
        ]

    def get_media(self, obj):
        rows = ListingMedia.objects.filter(listing_id=obj.id).order_by('position', 'created_at')
        return ListingMediaSerializer(rows, many=True, context=self.context).data

    def get_units(self, obj):
        if not obj.is_property_management:
            return []

        units = PropertyUnit.objects.filter(listing_id=obj.id).order_by('position', 'created_at')
        unit_ids = list(units.values_list('id', flat=True))
        active_associations = set(
            RenterUnitAssociation.objects.filter(
                unit_id__in=unit_ids,
                status='ACTIVE',
            ).values_list('unit_id', flat=True)
        )

        media_rows = ListingMedia.objects.filter(
            listing_id=obj.id,
            unit_id__in=unit_ids,
            media_type='photo',
        ).order_by('position', 'created_at')
        media_by_unit = {}
        for row in media_rows:
            media_by_unit.setdefault(str(row.unit_id), []).append(
                ListingMediaSerializer(row, context=self.context).data
            )

        payload = []
        for unit in units:
            occupied = unit.id in active_associations or str(unit.availability or '').strip().lower() in {
                'occupied', 'unavailable', 'rented', 'leased'
            }
            payload.append({
                'id': unit.id,
                'listing_id': unit.listing_id,
                'unit_number': unit.unit_number,
                'unit_type': unit.unit_type,
                'rent': unit.rent,
                'deposit_amount': unit.deposit_amount,
                'size': unit.size,
                'beds': unit.beds,
                'baths': unit.baths,
                'description': unit.description,
                'position': unit.position,
                'status': 'occupied' if occupied else 'available',
                'media': media_by_unit.get(str(unit.id), []),
            })
        return PropertyUnitPublicSerializer(payload, many=True).data

    def get_payment_methods(self, obj):
        if not obj.is_property_management or not obj.payment_enabled:
            return []

        owner = Profile.objects.filter(pk=obj.user_id).first()
        if not owner:
            return []

        role = str(getattr(owner, 'role', '') or '').lower()
        if role not in {'landlord', 'real_estate'}:
            return []

        # Use the same complete PMS access gate as the management system.
        # Listing Details only displays configured payment details; it never
        # creates invoices, payment transactions, or STK pushes.
        try:
            access = get_pms_access(owner)
        except Exception:
            return []
        if not access.get('allowed'):
            return []

        rows = LandlordPaymentMethod.objects.filter(
            landlord_id=obj.user_id,
            is_active=True,
        ).order_by('-is_default', 'created_at')
        payload = []
        for row in rows:
            payload.append({
                'id': row.id,
                'provider': row.provider,
                'display_name': row.display_name,
                'payment_method': row.mpesa_method,
                'paybill_number': row.paybill_number,
                'paybill_account': row.paybill_account,
                'till_number': row.till_number,
                'paypal_email': row.paypal_email,
                'is_default': row.is_default,
            })
        return ListingPaymentMethodPublicSerializer(payload, many=True).data

    def get_landlord(self, obj):
        profile = Profile.objects.filter(pk=obj.user_id).first()
        if not profile:
            return None
        return {
            'id': str(profile.id),
            'full_name': profile.full_name or '',
            'verification_status': profile.verification_status,
        }


class ListingUpdateSerializer(serializers.ModelSerializer):
    """Editable listing fields only; workflow/approval fields remain server-controlled."""

    class Meta:
        model = Listing
        fields = [
            'title', 'description', 'city', 'county', 'location_search', 'latitude', 'longitude',
            'property_name', 'property_type', 'price_kes', 'listing_type', 'deposit_required',
            'deposit_structure', 'deposit_amount', 'size', 'beds', 'baths', 'contact_phone',
            'contact_email', 'social_links', 'booking_enabled', 'payment_enabled', 'is_property_management',
        ]

    def validate_listing_type(self, value):
        if value not in {'rent', 'sale'}:
            raise serializers.ValidationError('listing_type must be rent or sale.')
        return value

    def validate_deposit_structure(self, value):
        if value is not None and value not in {'fixed', 'installments'}:
            raise serializers.ValidationError('deposit_structure must be fixed or installments.')
        return value


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
    listing_type = serializers.CharField(required=False, default='rent')
    deposit_required = serializers.BooleanField(required=False, default=False)
    deposit_structure = serializers.CharField(required=False, allow_null=True, allow_blank=True, default='fixed')
    deposit_amount = serializers.DecimalField(max_digits=14, decimal_places=2, required=False, default=0)
    size = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    beds = serializers.IntegerField(required=False, min_value=0, default=0)
    baths = serializers.IntegerField(required=False, min_value=0, default=0)
    contact_phone = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    contact_email = serializers.EmailField(required=False, allow_null=True, allow_blank=True)
    social_links = serializers.JSONField(required=False, default=list)
    booking_enabled = serializers.BooleanField(required=False, default=False)
    payment_enabled = serializers.BooleanField(required=False, default=False)
    is_property_management = serializers.BooleanField(required=False, default=False)

    def validate_listing_type(self, value):
        if value not in {'rent', 'sale'}:
            raise serializers.ValidationError('listing_type must be rent or sale.')
        return value

    def validate_deposit_structure(self, value):
        if value is not None and value not in {'fixed', 'installments'}:
            raise serializers.ValidationError('deposit_structure must be fixed or installments.')
        return value
