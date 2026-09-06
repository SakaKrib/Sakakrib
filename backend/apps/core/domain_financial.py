import uuid

from django.db import models


class MovingFinancialDocument(models.Model):
    """Auditable financial document for a moving booking.

    A booking can have one renter receipt and one mover settlement. Both
    documents point to the same booking/payment without changing the existing
    MovingInvoice contract used by the payment flow.
    """

    DOCUMENT_TYPES = [
        'RENTER_RECEIPT',
        'MOVER_SETTLEMENT',
    ]
    STATUSES = [
        'ISSUED',
        'PAID',
        'HELD',
        'RELEASED',
        'REFUNDED',
        'CANCELLED',
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    booking_id = models.UUIDField()
    payment_id = models.UUIDField(null=True, blank=True)
    document_type = models.TextField()
    document_number = models.TextField()
    renter_id = models.UUIDField()
    mover_id = models.UUIDField()
    amount_kes = models.DecimalField(max_digits=14, decimal_places=2)
    platform_fee_kes = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    mover_net_kes = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    currency = models.TextField(default='KES')
    status = models.TextField(default='ISSUED')
    payment_provider = models.TextField(null=True, blank=True)
    provider_reference = models.TextField(null=True, blank=True)
    provider_transaction_id = models.TextField(null=True, blank=True)
    mover_name_snapshot = models.TextField(default='')
    mover_phone_snapshot = models.TextField(null=True, blank=True)
    vehicle_type_snapshot = models.TextField(null=True, blank=True)
    number_plate_snapshot = models.TextField(null=True, blank=True)
    mover_profile_photo_snapshot = models.TextField(null=True, blank=True)
    issued_at = models.DateTimeField(auto_now_add=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    released_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'moving_financial_documents'
        constraints = [
            models.CheckConstraint(
                condition=models.Q(document_type__in=DOCUMENT_TYPES),
                name='moving_financial_documents_type_check',
            ),
            models.CheckConstraint(
                condition=models.Q(amount_kes__gte=0),
                name='moving_financial_documents_amount_check',
            ),
            models.CheckConstraint(
                condition=models.Q(platform_fee_kes__gte=0),
                name='moving_financial_documents_platform_fee_check',
            ),
            models.CheckConstraint(
                condition=models.Q(mover_net_kes__gte=0),
                name='moving_financial_documents_mover_net_check',
            ),
            models.CheckConstraint(
                condition=models.Q(currency='KES'),
                name='moving_financial_documents_currency_check',
            ),
            models.CheckConstraint(
                condition=models.Q(status__in=STATUSES),
                name='moving_financial_documents_status_check',
            ),
            models.CheckConstraint(
                condition=models.Q(payment_provider__isnull=True)
                | models.Q(payment_provider__in=['MPESA', 'PAYPAL']),
                name='moving_financial_documents_provider_check',
            ),
            models.UniqueConstraint(
                fields=['booking_id', 'document_type'],
                name='moving_financial_documents_booking_type_key',
            ),
            models.UniqueConstraint(
                fields=['document_number'],
                name='moving_financial_documents_number_key',
            ),
        ]
