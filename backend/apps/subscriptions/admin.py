from django.contrib import admin

from .models import (
    LandlordSubscription,
    RealEstateSubscription,
    SubscriptionInvoice,
    SubscriptionListing,
    SubscriptionPlan,
)


@admin.register(SubscriptionPlan)
class SubscriptionPlanAdmin(admin.ModelAdmin):
    list_display = (
        'name', 'audience', 'max_listings', 'max_units_per_listing',
        'monthly_price_kes', 'annual_price_kes', 'paypal_monthly_plan_id',
        'paypal_annual_plan_id', 'created_at',
    )
    list_filter = ('audience',)
    search_fields = ('name', 'paypal_product_id', 'paypal_monthly_plan_id', 'paypal_annual_plan_id')


@admin.register(LandlordSubscription)
class LandlordSubscriptionAdmin(admin.ModelAdmin):
    list_display = (
        'id', 'landlord_id', 'plan_id', 'billing_cycle', 'status',
        'current_period_start', 'current_period_end', 'grace_period_end',
        'auto_renew', 'paypal_subscription_id', 'next_billing_at',
    )
    list_filter = ('billing_cycle', 'status', 'auto_renew', 'cancel_at_period_end')
    search_fields = ('id', 'landlord_id', 'plan_id', 'paypal_subscription_id', 'paypal_plan_id')


@admin.register(RealEstateSubscription)
class RealEstateSubscriptionAdmin(admin.ModelAdmin):
    list_display = (
        'id', 'real_estate_id', 'plan_id', 'billing_cycle', 'status',
        'current_period_start', 'current_period_end', 'grace_period_end',
        'auto_renew', 'paypal_subscription_id', 'next_billing_at',
    )
    list_filter = ('billing_cycle', 'status', 'auto_renew', 'cancel_at_period_end')
    search_fields = ('id', 'real_estate_id', 'plan_id', 'paypal_subscription_id', 'paypal_plan_id')


@admin.register(SubscriptionListing)
class SubscriptionListingAdmin(admin.ModelAdmin):
    list_display = (
        'id', 'listing_id', 'subscription_id', 'real_estate_subscription_id',
        'status', 'activated_at', 'deactivated_at', 'created_at',
    )
    list_filter = ('status',)
    search_fields = ('id', 'listing_id', 'subscription_id', 'real_estate_subscription_id')


@admin.register(SubscriptionInvoice)
class SubscriptionInvoiceAdmin(admin.ModelAdmin):
    list_display = (
        'id', 'amount_kes', 'status', 'payment_provider', 'payment_method',
        'provider_reference', 'provider_transaction_id', 'landlord_subscription_id',
        'real_estate_subscription_id', 'listing', 'created_at', 'paid_at',
    )
    list_filter = ('status', 'payment_provider', 'payment_method', 'pricing_snapshot_source')
    search_fields = (
        'id', 'provider_reference', 'provider_transaction_id', 'mpesa_receipt',
        'checkout_request_id', 'paypal_subscription_id', 'landlord_subscription_id',
        'real_estate_subscription_id', 'listing__title',
    )
    readonly_fields = ('created_at', 'paid_at')
    raw_id_fields = ('listing',)
