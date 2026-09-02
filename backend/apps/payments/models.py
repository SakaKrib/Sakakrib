import uuid

from django.db import models

from apps.accounts.models import Profile
from apps.listings.models import Listing


class ListingPayment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # Preserve the financial ledger if a listing is later removed. A paid
    # listing must be explicitly archived/handled rather than cascading away
    # its payment history.
    listing = models.ForeignKey(Listing, on_delete=models.PROTECT, db_column='listing_id', related_name='listing_payments')
    user = models.ForeignKey(Profile, on_delete=models.PROTECT, db_column='user_id', related_name='listing_payments')
    amount_kes = models.DecimalField(max_digits=14, decimal_places=2, default=1000)
    mpesa_receipt = models.TextField(null=True, blank=True)
    checkout_request_id = models.TextField(null=True, blank=True)
    merchant_request_id = models.TextField(null=True, blank=True)
    phone_number = models.TextField(null=True, blank=True)
    status = models.TextField(default='PENDING')
    result_code = models.IntegerField(null=True, blank=True)
    result_description = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    payment_provider = models.TextField(null=True, blank=True)
    payment_method = models.TextField(null=True, blank=True)
    provider_reference = models.TextField(null=True, blank=True)
    provider_amount = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    provider_currency = models.TextField(null=True, blank=True)
    paypal_order_id = models.TextField(null=True, blank=True)
    paypal_fx_rate = models.DecimalField(max_digits=18, decimal_places=8, null=True, blank=True)

    class Meta:
        db_table = 'listing_payments'
        constraints = [
            models.CheckConstraint(condition=models.Q(amount_kes__gt=0), name='listing_payments_amount_check'),
            models.CheckConstraint(condition=models.Q(amount_kes=1000), name='listing_payments_amount_fixed_check'),
            models.CheckConstraint(condition=models.Q(status__in=['PENDING', 'PAID', 'FAILED', 'CANCELLED']), name='listing_payments_status_check'),
            models.CheckConstraint(condition=models.Q(payment_provider__isnull=True) | models.Q(payment_provider__in=['MPESA', 'PAYPAL']), name='listing_payments_provider_check'),
            models.CheckConstraint(condition=models.Q(payment_method__isnull=True) | models.Q(payment_method__in=['MPESA', 'PAYPAL']), name='listing_payments_method_check'),
            models.UniqueConstraint(fields=['checkout_request_id'], name='listing_payments_checkout_request_id_key'),
            models.UniqueConstraint(fields=['provider_reference'], name='listing_payments_provider_reference_key'),
        ]
