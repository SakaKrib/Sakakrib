import uuid
from datetime import timedelta

from django.db import models
from django.utils import timezone

from apps.accounts.models import Profile


def _listing_payment_intent_expiry():
    return timezone.now() + timedelta(minutes=15)


class Listing(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(Profile, on_delete=models.CASCADE, db_column='user_id', related_name='listings')
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
    beds = models.IntegerField(default=0, null=True, blank=True)
    baths = models.IntegerField(default=0, null=True, blank=True)
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
        indexes = [
            models.Index(fields=['city'], name='idx_listings_city'),
            models.Index(fields=['-created_at'], name='idx_listings_created_at'),
            models.Index(fields=['user'], name='idx_listings_user_id'),
            models.Index(fields=['is_property_management'], name='listings_property_management_idx'),
        ]
        constraints = [
            models.CheckConstraint(condition=models.Q(listing_type__in=['rent', 'sale']), name='listings_listing_type_valid'),
            models.CheckConstraint(condition=models.Q(deposit_structure__in=['fixed', 'installments']) | models.Q(deposit_structure__isnull=True), name='listings_deposit_structure_valid'),
            models.CheckConstraint(condition=models.Q(approval_status__in=['pending_review', 'approved', 'rejected']), name='listings_approval_status_valid'),
            models.CheckConstraint(condition=models.Q(status__in=['pending', 'approved', 'rejected']), name='listings_status_valid'),
        ]


class ListingPaymentIntent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(Profile, on_delete=models.CASCADE, db_column='user_id', related_name='listing_payment_intents')
    role = models.TextField()
    amount_kes = models.DecimalField(max_digits=12, decimal_places=2, default=1000)
    status = models.TextField(default='PENDING')
    listing_data = models.JSONField()
    provider = models.TextField(null=True, blank=True)
    provider_reference = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(default=_listing_payment_intent_expiry)
    listing = models.ForeignKey(Listing, on_delete=models.SET_NULL, db_column='listing_id', related_name='payment_intents', null=True, blank=True)
    provider_amount = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    provider_currency = models.TextField(null=True, blank=True)
    paypal_order_id = models.TextField(null=True, blank=True)
    paypal_fx_rate = models.DecimalField(max_digits=18, decimal_places=8, null=True, blank=True)

    class Meta:
        db_table = 'listing_payment_intents'
        indexes = [
            models.Index(fields=['listing'], name='idx_listing_payment_intents_listing_id'),
            models.Index(fields=['user', 'status', '-created_at'], name='listing_payment_intents_user_status_idx'),
            models.Index(fields=['provider', 'provider_reference'], name='listing_payment_intents_provider_reference_idx', condition=models.Q(provider_reference__isnull=False)),
        ]
        constraints = [
            models.CheckConstraint(condition=models.Q(role__in=['landlord', 'real_estate']), name='listing_payment_intents_role_valid'),
            models.CheckConstraint(condition=models.Q(amount_kes=1000), name='listing_payment_intents_amount_1000'),
            models.CheckConstraint(condition=models.Q(status__in=['PENDING', 'PAID', 'FAILED', 'CANCELLED', 'EXPIRED']), name='listing_payment_intents_status_valid'),
            models.UniqueConstraint(fields=['provider_reference'], condition=models.Q(provider_reference__isnull=False), name='listing_payment_intents_provider_reference_key'),
            models.UniqueConstraint(fields=['paypal_order_id'], condition=models.Q(paypal_order_id__isnull=False), name='listing_payment_intents_paypal_order_id_key'),
        ]
