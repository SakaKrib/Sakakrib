import uuid
from django.db import models
from django.contrib.postgres.fields import ArrayField


class Listing(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user_id = models.UUIDField()
    title = models.TextField()
    description = models.TextField()
    city = models.TextField()
    county = models.TextField()
    location_search = models.TextField(null=True, blank=True)
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    property_name = models.TextField(null=True, blank=True)
    property_type = models.TextField(null=True, blank=True)
    price_kes = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    listing_type = models.TextField(default='rent')
    deposit_required = models.BooleanField(default=False)
    deposit_structure = models.TextField(null=True, blank=True)
    deposit_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    size = models.TextField(null=True, blank=True)
    beds = models.IntegerField(default=0)
    baths = models.IntegerField(default=0)
    contact_phone = models.TextField(null=True, blank=True)
    contact_email = models.TextField(null=True, blank=True)
    social_links = models.JSONField(default=list)
    booking_enabled = models.BooleanField(default=False)
    payment_enabled = models.BooleanField(default=False)
    is_property_management = models.BooleanField(default=False)
    is_paid = models.BooleanField(default=False)
    is_published = models.BooleanField(default=False)
    approval_status = models.TextField(default='pending_review')
    is_approved = models.BooleanField(default=False)
    status = models.TextField(default='pending')
    admin_reviewed_at = models.DateTimeField(null=True, blank=True)
    admin_review_note = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'listings'


class ListingPaymentIntent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user_id = models.UUIDField()
    role = models.TextField()
    amount_kes = models.DecimalField(max_digits=12, decimal_places=2, default=1000)
    status = models.TextField(default='PENDING')
    listing_data = models.JSONField()
    provider = models.TextField(null=True, blank=True)
    provider_reference = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    listing_id = models.UUIDField(null=True, blank=True)
    provider_amount = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    provider_currency = models.TextField(null=True, blank=True)
    paypal_order_id = models.TextField(null=True, blank=True)
    paypal_fx_rate = models.DecimalField(max_digits=18, decimal_places=8, null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'listing_payment_intents'
