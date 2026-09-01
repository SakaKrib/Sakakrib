import uuid
from django.db import models


class ListingPayment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user_id = models.UUIDField()
    listing_id = models.UUIDField(null=True, blank=True)
    payment_intent_id = models.UUIDField(null=True, blank=True)
    amount_kes = models.DecimalField(max_digits=14, decimal_places=2)
    status = models.TextField(default='PENDING')
    payment_provider = models.TextField(null=True, blank=True)
    payment_method = models.TextField(null=True, blank=True)
    provider_reference = models.TextField(null=True, blank=True)
    provider_transaction_id = models.TextField(null=True, blank=True)
    checkout_request_id = models.TextField(null=True, blank=True)
    merchant_request_id = models.TextField(null=True, blank=True)
    mpesa_receipt = models.TextField(null=True, blank=True)
    phone_number = models.TextField(null=True, blank=True)
    provider_amount = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    provider_currency = models.TextField(null=True, blank=True)
    paypal_order_id = models.TextField(null=True, blank=True)
    paypal_fx_rate = models.DecimalField(max_digits=18, decimal_places=8, null=True, blank=True)
    result_code = models.IntegerField(null=True, blank=True)
    result_description = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'listing_payments'
