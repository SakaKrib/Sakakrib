import uuid

from django.contrib.postgres.fields import ArrayField
from django.db import models


def default_rent_reminder_offsets():
    return [7, 3, 1, 0, -1]


def default_rent_reminder_channels():
    return ['IN_APP']


class RentInvoicePeriod(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    invoice_id = models.UUIDField()
    renter_assoc_id = models.UUIDField()
    unit_id = models.UUIDField()
    period_year = models.IntegerField()
    period_month = models.IntegerField()
    amount_kes = models.DecimalField(max_digits=14, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'rent_invoice_periods'


class RentInvoice(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    invoice_number = models.TextField(unique=True)
    landlord_id = models.UUIDField()
    renter_user_id = models.UUIDField()
    renter_assoc_id = models.UUIDField()
    listing_id = models.UUIDField()
    unit_id = models.UUIDField()
    billing_period_start = models.DateField()
    billing_period_end = models.DateField()
    due_date = models.DateField()
    amount_kes = models.DecimalField(max_digits=14, decimal_places=2)
    currency = models.TextField(default='KES')
    status = models.TextField(default='DUE')
    payment_method_id = models.UUIDField(null=True, blank=True)
    payment_destination_snapshot = models.JSONField(default=dict)
    transaction_reference = models.TextField(null=True, blank=True)
    payment_method = models.TextField(null=True, blank=True)
    payment_date = models.DateField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    confirmed_by = models.UUIDField(null=True, blank=True)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'rent_invoices'


class RentPaymentIntent(models.Model):
    """Legacy provider-payment model retained only for schema compatibility.

    The active SakaCrib rent workflow does not use this model. Rent is settled
    externally and recorded through RentPaymentSubmission + landlord verification.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    renter_user_id = models.UUIDField()
    renter_assoc_id = models.UUIDField()
    unit_id = models.UUIDField()
    landlord_id = models.UUIDField()
    payment_periods = models.JSONField()
    amount_kes = models.DecimalField(max_digits=14, decimal_places=2)
    status = models.TextField(default='PENDING')
    provider = models.TextField(null=True, blank=True)
    payment_method = models.TextField(null=True, blank=True)
    provider_reference = models.TextField(null=True, blank=True)
    provider_amount = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    provider_currency = models.TextField(null=True, blank=True)
    paypal_order_id = models.TextField(null=True, blank=True)
    paypal_fx_rate = models.DecimalField(max_digits=18, decimal_places=8, null=True, blank=True)
    mpesa_receipt = models.TextField(null=True, blank=True)
    checkout_request_id = models.TextField(null=True, blank=True)
    merchant_request_id = models.TextField(null=True, blank=True)
    phone_number = models.TextField(null=True, blank=True)
    result_code = models.IntegerField(null=True, blank=True)
    result_description = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField()
    payment_method_id = models.UUIDField(null=True, blank=True)
    payment_destination_snapshot = models.JSONField(null=True, blank=True)

    class Meta:
        db_table = 'rent_payment_intents'


class RentPaymentSubmission(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    invoice_id = models.UUIDField()
    renter_user_id = models.UUIDField()
    landlord_id = models.UUIDField()
    renter_assoc_id = models.UUIDField()
    unit_id = models.UUIDField()
    transaction_reference = models.TextField()
    payment_method = models.TextField(null=True, blank=True)
    payment_date = models.DateField(null=True, blank=True)
    status = models.TextField(default='PENDING')
    submitted_at = models.DateTimeField(auto_now_add=True)
    confirmed_by = models.UUIDField(null=True, blank=True)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'rent_payment_submissions'


class RentPayment(models.Model):
    """Legacy actual-payment model retained only for compatibility.

    Do not use for the active rent workflow. Actual funds move externally.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    renter_assoc_id = models.UUIDField()
    unit_id = models.UUIDField()
    landlord_id = models.UUIDField()
    amount_kes = models.DecimalField(max_digits=14, decimal_places=2)
    period_year = models.IntegerField()
    period_month = models.IntegerField()
    status = models.TextField(default='UNPAID')
    mpesa_receipt = models.TextField(null=True, blank=True)
    checkout_request_id = models.TextField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    payment_provider = models.TextField(null=True, blank=True, default='MPESA')
    payment_method = models.TextField(null=True, blank=True, default='MPESA')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    payment_intent_id = models.UUIDField(null=True, blank=True)
    provider_reference = models.TextField(null=True, blank=True)
    provider_amount = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    provider_currency = models.TextField(null=True, blank=True)
    paypal_order_id = models.TextField(null=True, blank=True)
    paypal_fx_rate = models.DecimalField(max_digits=18, decimal_places=8, null=True, blank=True)
    merchant_request_id = models.TextField(null=True, blank=True)
    phone_number = models.TextField(null=True, blank=True)
    result_code = models.IntegerField(null=True, blank=True)
    result_description = models.TextField(null=True, blank=True)
    payment_method_id = models.UUIDField(null=True, blank=True)
    payment_destination_snapshot = models.JSONField(null=True, blank=True)

    class Meta:
        db_table = 'rent_payments'


class RentReminderSetting(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    renter_assoc_id = models.UUIDField()
    landlord_id = models.UUIDField()
    enabled = models.BooleanField(default=True)
    recurring = models.BooleanField(default=True)
    offsets_days = ArrayField(models.IntegerField(), default=default_rent_reminder_offsets)
    channels = ArrayField(models.TextField(), default=default_rent_reminder_channels)
    custom_message = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'rent_reminder_settings'
        constraints = [
            models.UniqueConstraint(
                fields=('renter_assoc_id',),
                name='rent_reminder_settings_renter_assoc_id_key',
            ),
        ]


class RentReminder(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    renter_assoc_id = models.UUIDField()
    landlord_id = models.UUIDField()
    payment_period_year = models.IntegerField()
    payment_period_month = models.IntegerField()
    due_date = models.DateField()
    scheduled_for = models.DateTimeField()
    offset_days = models.IntegerField()
    channel = models.TextField()
    message = models.TextField()
    status = models.TextField(default='PENDING')
    sent_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    failed_at = models.DateTimeField(null=True, blank=True)
    failure_reason = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'rent_reminders'
        constraints = [
            models.UniqueConstraint(
                fields=(
                    'renter_assoc_id',
                    'payment_period_year',
                    'payment_period_month',
                    'offset_days',
                    'channel',
                ),
                name='rent_reminders_renter_assoc_period_offset_channel_key',
            ),
        ]
        indexes = [
            models.Index(
                fields=('scheduled_for', 'status'),
                name='rent_reminders_due_idx',
            ),
        ]
