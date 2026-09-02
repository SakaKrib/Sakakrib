from django.contrib import admin

from .models import ListingPayment


@admin.register(ListingPayment)
class ListingPaymentAdmin(admin.ModelAdmin):
    list_display = (
        'id', 'listing', 'user', 'amount_kes', 'status', 'payment_provider',
        'payment_method', 'provider_reference', 'mpesa_receipt', 'paypal_order_id',
        'created_at', 'paid_at',
    )
    list_filter = ('status', 'payment_provider', 'payment_method')
    search_fields = (
        'id', 'user__email', 'listing__title', 'provider_reference',
        'mpesa_receipt', 'checkout_request_id', 'paypal_order_id',
    )
    readonly_fields = ('created_at', 'paid_at')
    raw_id_fields = ('listing', 'user')
