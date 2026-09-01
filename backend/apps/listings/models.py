import uuid

from django.db import models


class Listing(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user_id = models.UUIDField()
    title = models.TextField(default='')
    description = models.TextField(default='')
    city = models.TextField(default='')
    county = models.TextField(default='')
    location_search = models.TextField(null=True, blank=True)
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    property_name = models.TextField(null=True, blank=True)
    property_type = models.TextField(null=True, blank=True)
    price_kes = models.DecimalField(max_digits=14, decimal_places=2, default=0, null=True, blank=True)
    listing_type = models.TextField(default='rent')
    deposit_required = models.BooleanField(default=False, null=True)
    deposit_structure = models.TextField(default='fixed', null=True, blank=True)
    deposit_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0, null=True, blank=True)
    size = models.TextField(default='', null=True, blank=True)
    beds = models.IntegerField(default=0, null=True)
    baths = models.IntegerField(default=0, null=True)
    contact_phone = models.TextField(default='', null=True, blank=True)
    contact_email = models.TextField(default='', null=True, blank=True)
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
    admin_review_note = models.TextField(default='', null=True, blank=True)
    ai_caption = models.TextField(null=True, blank=True)
    ai_caption_generated_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'listings'
        constraints = [
            models.CheckConstraint(
                condition=models.Q(listing_type__in=['rent', 'sale']),
                name='listings_listing_type_valid',
            ),
            models.CheckConstraint(
                condition=models.Q(deposit_structure__in=['fixed', 'installments'])
                | models.Q(deposit_structure__isnull=True),
                name='listings_deposit_structure_valid',
            ),
            models.CheckConstraint(
                condition=models.Q(approval_status__in=['pending_review', 'approved', 'rejected']),
                name='listings_approval_status_valid',
            ),
        ]


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
        db_table = 'listing_payment_intents'
        constraints = [
            models.CheckConstraint(
                condition=models.Q(role__in=['landlord', 'real_estate']),
                name='listing_payment_intents_role_valid',
            ),
            models.CheckConstraint(
                condition=models.Q(amount_kes=1000),
                name='listing_payment_intents_amount_1000',
            ),
            models.CheckConstraint(
                condition=models.Q(status__in=['PENDING', 'PAID', 'FAILED', 'CANCELLED', 'EXPIRED']),
                name='listing_payment_intents_status_valid',
            ),
        ]
