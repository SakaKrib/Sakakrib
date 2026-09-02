from django.contrib import admin

from .models import Listing, ListingPaymentIntent


@admin.register(Listing)
class ListingAdmin(admin.ModelAdmin):
    list_display = (
        'title', 'user', 'role', 'is_draft', 'is_published',
        'approval_status', 'status', 'is_paid', 'is_property_management',
        'created_at', 'updated_at',
    )
    list_filter = (
        'is_draft', 'is_published', 'is_paid', 'is_property_management',
        'approval_status', 'status', 'listing_type', 'booking_enabled',
        'payment_enabled',
    )
    search_fields = ('title', 'city', 'county', 'property_name', 'user__email')
    readonly_fields = ('created_at', 'updated_at', 'admin_reviewed_at')
    raw_id_fields = ('user',)

    @admin.display(description='Owner role')
    def role(self, obj):
        return obj.user.role


@admin.register(ListingPaymentIntent)
class ListingPaymentIntentAdmin(admin.ModelAdmin):
    list_display = (
        'id', 'user', 'role', 'amount_kes', 'status', 'provider',
        'provider_reference', 'paypal_order_id', 'listing', 'created_at', 'paid_at',
    )
    list_filter = ('role', 'status', 'provider')
    search_fields = (
        'id', 'user__email', 'provider_reference', 'paypal_order_id',
        'listing__title',
    )
    readonly_fields = ('created_at', 'updated_at', 'paid_at')
    raw_id_fields = ('user', 'listing')
