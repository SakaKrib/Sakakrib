import uuid
from django.db import models


class SubscriptionPlan(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.TextField()
    max_units_per_listing = models.IntegerField(null=True, blank=True)
    monthly_price_kes = models.DecimalField(max_digits=14, decimal_places=2)
    annual_price_kes = models.DecimalField(max_digits=14, decimal_places=2)
    created_at = models.DateTimeField()
    max_listings = models.IntegerField(null=True, blank=True)
    audience = models.TextField(default='LANDLORD')
    paypal_product_id = models.TextField(null=True, blank=True)
    paypal_monthly_plan_id = models.TextField(null=True, blank=True)
    paypal_annual_plan_id = models.TextField(null=True, blank=True)
    paypal_monthly_price_usd = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    paypal_annual_price_usd = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    paypal_fx_rate = models.DecimalField(max_digits=18, decimal_places=8, null=True, blank=True)
    paypal_fx_rate_timestamp = models.DateTimeField(null=True, blank=True)
    class Meta:
        db_table = 'subscription_plans'

class LandlordSubscription(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    landlord_id = models.UUIDField()
    plan_id = models.UUIDField()
    billing_cycle = models.TextField(default='MONTHLY')
    status = models.TextField(default='PENDING_PAYMENT')
    current_period_start = models.DateTimeField()
    current_period_end = models.DateTimeField()
    grace_period_end = models.DateTimeField(null=True, blank=True)
    auto_renew = models.BooleanField(default=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    paypal_subscription_id = models.TextField(null=True, blank=True)
    paypal_plan_id = models.TextField(null=True, blank=True)
    paypal_status = models.TextField(null=True, blank=True)
    next_billing_at = models.DateTimeField(null=True, blank=True)
    cancel_at_period_end = models.BooleanField(default=False)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    billing_amount_kes = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    billing_amount_usd = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    billing_exchange_rate = models.DecimalField(max_digits=18, decimal_places=8, null=True, blank=True)
    billing_exchange_rate_timestamp = models.DateTimeField(null=True, blank=True)
    class Meta:
        db_table = 'landlord_subscriptions'
        constraints = [models.UniqueConstraint(fields=['landlord_id'], condition=models.Q(status='PENDING_PAYMENT'), name='landlord_sub_pending_uidx'), models.UniqueConstraint(fields=['landlord_id'], condition=models.Q(status__in=['ACTIVE', 'GRACE_PERIOD']), name='landlord_sub_current_uidx'), models.UniqueConstraint(fields=['paypal_subscription_id'], condition=models.Q(paypal_subscription_id__isnull=False), name='landlord_sub_paypal_uidx')]

class RealEstateSubscription(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    real_estate_id = models.UUIDField()
    plan_id = models.UUIDField()
    billing_cycle = models.TextField(default='MONTHLY')
    status = models.TextField(default='PENDING_PAYMENT')
    current_period_start = models.DateTimeField(null=True, blank=True)
    current_period_end = models.DateTimeField(null=True, blank=True)
    grace_period_end = models.DateTimeField(null=True, blank=True)
    auto_renew = models.BooleanField(default=False)
    created_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(null=True, blank=True)
    paypal_subscription_id = models.TextField(null=True, blank=True)
    paypal_plan_id = models.TextField(null=True, blank=True)
    paypal_status = models.TextField(null=True, blank=True)
    next_billing_at = models.DateTimeField(null=True, blank=True)
    cancel_at_period_end = models.BooleanField(default=False)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    billing_amount_kes = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    billing_amount_usd = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    billing_exchange_rate = models.DecimalField(max_digits=18, decimal_places=8, null=True, blank=True)
    billing_exchange_rate_timestamp = models.DateTimeField(null=True, blank=True)
    class Meta:
        db_table = 'real_estate_subscriptions'
        constraints = [models.UniqueConstraint(fields=['real_estate_id'], condition=models.Q(status='PENDING_PAYMENT'), name='realestate_sub_pending_uidx'), models.UniqueConstraint(fields=['real_estate_id'], condition=models.Q(status__in=['ACTIVE', 'GRACE_PERIOD']), name='realestate_sub_current_uidx'), models.UniqueConstraint(fields=['paypal_subscription_id'], condition=models.Q(paypal_subscription_id__isnull=False), name='realestate_sub_paypal_uidx')]

class SubscriptionListing(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    subscription_id = models.UUIDField(null=True, blank=True)
    listing_id = models.UUIDField()
    status = models.TextField(default='ACTIVE')
    activated_at = models.DateTimeField()
    deactivated_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField()
    real_estate_subscription_id = models.UUIDField(null=True, blank=True)
    class Meta:
        db_table = 'subscription_listings'
        constraints = [models.UniqueConstraint(fields=['subscription_id', 'listing_id'], condition=models.Q(subscription_id__isnull=False), name='subscription_listing_landlord_uidx'), models.UniqueConstraint(fields=['real_estate_subscription_id', 'listing_id'], condition=models.Q(real_estate_subscription_id__isnull=False), name='subscription_listing_re_uidx')]

class SubscriptionInvoice(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    amount_kes = models.DecimalField(max_digits=14, decimal_places=2)
    mpesa_receipt = models.TextField(null=True, blank=True)
    checkout_request_id = models.TextField(null=True, blank=True)
    merchant_request_id = models.TextField(null=True, blank=True)
    phone_number = models.TextField(null=True, blank=True)
    status = models.TextField(default='PENDING')
    result_code = models.IntegerField(null=True, blank=True)
    result_description = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField()
    paid_at = models.DateTimeField(null=True, blank=True)
    payment_provider = models.TextField(default='MPESA')
    provider_reference = models.TextField(null=True, blank=True)
    provider_transaction_id = models.TextField(null=True, blank=True)
    payment_method = models.TextField(null=True, blank=True)
    landlord_subscription_id = models.UUIDField(null=True, blank=True)
    real_estate_subscription_id = models.UUIDField(null=True, blank=True)
    currency = models.TextField(null=True, blank=True)
    amount_usd = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    exchange_rate = models.DecimalField(max_digits=18, decimal_places=8, null=True, blank=True)
    exchange_rate_source = models.TextField(null=True, blank=True)
    exchange_rate_timestamp = models.DateTimeField(null=True, blank=True)
    paypal_subscription_id = models.TextField(null=True, blank=True)
    billing_period_start = models.DateTimeField(null=True, blank=True)
    billing_period_end = models.DateTimeField(null=True, blank=True)
    webhook_event_id = models.TextField(null=True, blank=True)
    pricing_snapshot_source = models.TextField(null=True, blank=True)
    listing = models.ForeignKey('listings.Listing', on_delete=models.SET_NULL, null=True, blank=True, related_name='subscription_invoices', db_column='listing_id')
    class Meta:
        db_table = 'subscription_invoices'
        constraints = [models.UniqueConstraint(fields=['webhook_event_id'], condition=models.Q(webhook_event_id__isnull=False), name='subscription_invoices_webhook_event_uidx'), models.UniqueConstraint(fields=['checkout_request_id'], condition=models.Q(checkout_request_id__isnull=False), name='subscription_invoice_checkout_uidx'), models.UniqueConstraint(fields=['provider_reference'], condition=models.Q(provider_reference__isnull=False), name='subscription_invoice_provider_ref_uidx'), models.UniqueConstraint(fields=['paypal_subscription_id'], condition=models.Q(paypal_subscription_id__isnull=False), name='subscription_invoice_paypal_sub_uidx')]