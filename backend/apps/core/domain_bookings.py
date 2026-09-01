import uuid

from django.db import models


class BookingEvent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    conversation_id = models.TextField()
    renter_id = models.UUIDField()
    mover_id = models.UUIDField()
    mover_profile_id = models.UUIDField(null=True, blank=True)
    relocation_date = models.DateField()
    day_of_week = models.TextField()
    pickup_time = models.TimeField()
    pickup_address = models.TextField()
    dropoff_address = models.TextField()
    negotiated_price = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    commission_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    status = models.TextField(default='pending')
    payment_method = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    distance_km = models.DecimalField(max_digits=14, decimal_places=4, null=True, blank=True)
    rate_per_km_kes = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    base_rate_kes = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)

    class Meta:
        db_table = 'booking_events'


class Booking(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    renter_id = models.UUIDField()
    mover_id = models.UUIDField()
    listing_id = models.UUIDField(null=True, blank=True)
    pickup_address = models.TextField(default='')
    dropoff_address = models.TextField(default='')
    moving_date = models.DateField()
    booking_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    commission_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    status = models.TextField(default='pending')
    payment_status = models.TextField(default='unpaid')
    payment_method = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(null=True, blank=True)
    distance_km = models.DecimalField(max_digits=14, decimal_places=4, null=True, blank=True)
    rate_per_km_kes = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    base_rate_kes = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    pickup_latitude = models.FloatField(null=True, blank=True)
    pickup_longitude = models.FloatField(null=True, blank=True)
    dropoff_latitude = models.FloatField(null=True, blank=True)
    dropoff_longitude = models.FloatField(null=True, blank=True)
    requested_at = models.DateTimeField(null=True, blank=True)
    request_expires_at = models.DateTimeField(null=True, blank=True)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    scheduled_start_at = models.DateTimeField(null=True, blank=True)
    scheduled_end_at = models.DateTimeField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancellation_reason = models.TextField(null=True, blank=True)
    cancellation_details = models.TextField(null=True, blank=True)
    tracking_number = models.TextField(null=True, blank=True)
    renter_confirmed_delivery_at = models.DateTimeField(null=True, blank=True)
    contact_released_at = models.DateTimeField(null=True, blank=True)
    last_known_latitude = models.FloatField(null=True, blank=True)
    last_known_longitude = models.FloatField(null=True, blank=True)
    last_location_at = models.DateTimeField(null=True, blank=True)
    mover_confirmed_delivery_at = models.DateTimeField(null=True, blank=True)
    dispute_status = models.TextField(default='NONE')

    class Meta:
        db_table = 'bookings'
        constraints = [
            models.CheckConstraint(
                condition=models.Q(status__in=['pending', 'confirmed', 'in_progress', 'completed', 'cancelled']),
                name='bookings_status_check',
            ),
            models.CheckConstraint(
                condition=models.Q(payment_status__in=['unpaid', 'paid', 'refunded']),
                name='bookings_payment_status_check',
            ),
            models.CheckConstraint(
                condition=models.Q(dispute_status__in=['NONE', 'OPEN', 'RESOLVED']),
                name='bookings_dispute_status_check',
            ),
        ]


class ChatMessage(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    conversation_id = models.TextField()
    sender_id = models.UUIDField()
    receiver_id = models.UUIDField()
    content = models.TextField(default='')
    message_type = models.TextField(default='text')
    event_data = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'chat_messages'
        constraints = [
            models.CheckConstraint(
                condition=models.Q(message_type__in=[
                    'text', 'image', 'booking_request', 'booking_response',
                    'schedule_proposed', 'schedule_confirmed', 'event_request',
                    'event_confirmed', 'event_declined', 'system',
                ]),
                name='chat_messages_message_type_check',
            ),
        ]


class MoverScheduleEvent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    mover_id = models.UUIDField()
    booking_id = models.UUIDField()
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()
    status = models.TextField(default='CONFIRMED')
    title = models.TextField(default='Moving service')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'mover_schedule_events'
        constraints = [
            models.CheckConstraint(
                condition=models.Q(ends_at__gt=models.F('starts_at')),
                name='mover_schedule_events_check',
            ),
            models.CheckConstraint(
                condition=models.Q(status__in=['TENTATIVE', 'CONFIRMED', 'CANCELLED']),
                name='mover_schedule_events_status_check',
            ),
            models.UniqueConstraint(fields=['booking_id'], name='mover_schedule_events_booking_id_key'),
        ]


class MovingCancellationEvent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    booking_id = models.UUIDField()
    cancelled_by = models.UUIDField()
    reason_code = models.TextField()
    reason_text = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'moving_cancellation_events'
        constraints = [
            models.CheckConstraint(
                condition=models.Q(reason_code__in=[
                    'MOVER_DID_NOT_CONFIRM', 'MOVER_TAKING_TOO_LONG', 'CHANGED_MIND',
                    'OTHER', 'RENTER_CANCELLED', 'MOVER_CANCELLED', 'MOVER_UNAVAILABLE',
                ]),
                name='moving_cancellation_events_reason_code_check',
            ),
        ]


class MovingDispute(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    booking_id = models.UUIDField()
    opened_by = models.UUIDField()
    reason_code = models.TextField()
    description = models.TextField()
    status = models.TextField(default='OPEN')
    resolution_code = models.TextField(null=True, blank=True)
    resolution_notes = models.TextField(null=True, blank=True)
    resolved_by = models.UUIDField(null=True, blank=True)
    opened_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'moving_disputes'
        constraints = [
            models.CheckConstraint(
                condition=models.Q(status__in=['OPEN', 'RESOLVED']),
                name='moving_disputes_status_check',
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(resolution_code__isnull=True)
                    | models.Q(resolution_code__in=[
                        'RELEASE_TO_MOVER', 'REFUND_RENTER', 'PARTIAL_REFUND', 'NO_REFUND',
                    ])
                ),
                name='moving_disputes_resolution_check',
            ),
        ]


class MovingTrackingPoint(models.Model):
    id = models.BigAutoField(primary_key=True)
    booking_id = models.UUIDField()
    mover_id = models.UUIDField()
    latitude = models.FloatField()
    longitude = models.FloatField()
    accuracy_meters = models.FloatField(null=True, blank=True)
    speed_kph = models.FloatField(null=True, blank=True)
    heading_degrees = models.FloatField(null=True, blank=True)
    recorded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'moving_tracking_points'
        constraints = [
            models.CheckConstraint(
                condition=models.Q(latitude__gte=-90) & models.Q(latitude__lte=90),
                name='moving_tracking_points_latitude_check',
            ),
            models.CheckConstraint(
                condition=models.Q(longitude__gte=-180) & models.Q(longitude__lte=180),
                name='moving_tracking_points_longitude_check',
            ),
        ]


class MovingInvoice(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    booking_id = models.UUIDField()
    invoice_number = models.TextField()
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
    paid_at = models.DateTimeField(null=True, blank=True)
    released_at = models.DateTimeField(null=True, blank=True)
    mover_name_snapshot = models.TextField(default='')
    mover_phone_snapshot = models.TextField(null=True, blank=True)
    vehicle_type_snapshot = models.TextField(null=True, blank=True)
    number_plate_snapshot = models.TextField(null=True, blank=True)
    mover_profile_photo_snapshot = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'moving_invoices'
        constraints = [
            models.CheckConstraint(condition=models.Q(amount_kes__gte=0), name='moving_invoices_amount_kes_check'),
            models.CheckConstraint(condition=models.Q(platform_fee_kes__gte=0), name='moving_invoices_platform_fee_kes_check'),
            models.CheckConstraint(condition=models.Q(mover_net_kes__gte=0), name='moving_invoices_mover_net_kes_check'),
            models.CheckConstraint(condition=models.Q(currency='KES'), name='moving_invoices_currency_check'),
            models.CheckConstraint(
                condition=models.Q(payment_provider__isnull=True) | models.Q(payment_provider__in=['MPESA', 'PAYPAL']),
                name='moving_invoices_payment_provider_check',
            ),
            models.CheckConstraint(
                condition=models.Q(status__in=['ISSUED', 'PAID', 'HELD', 'RELEASED', 'REFUNDED', 'CANCELLED']),
                name='moving_invoices_status_check',
            ),
            models.UniqueConstraint(fields=['booking_id'], name='moving_invoices_booking_id_key'),
            models.UniqueConstraint(fields=['invoice_number'], name='moving_invoices_invoice_number_key'),
        ]


class MovingPayment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    booking_id = models.UUIDField()
    invoice_id = models.UUIDField()
    payer_id = models.UUIDField()
    amount_kes = models.DecimalField(max_digits=14, decimal_places=2)
    provider = models.TextField()
    status = models.TextField(default='PENDING')
    provider_reference = models.TextField(null=True, blank=True)
    provider_transaction_id = models.TextField(null=True, blank=True)
    mpesa_receipt = models.TextField(null=True, blank=True)
    paypal_order_id = models.TextField(null=True, blank=True)
    provider_amount = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    provider_currency = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    released_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'moving_payments'
        constraints = [
            models.CheckConstraint(condition=models.Q(amount_kes__gt=0), name='moving_payments_amount_kes_check'),
            models.CheckConstraint(condition=models.Q(provider__in=['MPESA', 'PAYPAL']), name='moving_payments_provider_check'),
            models.CheckConstraint(
                condition=models.Q(status__in=[
                    'PENDING', 'PROCESSING', 'PAID', 'HELD', 'RELEASED', 'FAILED', 'REFUNDED', 'CANCELLED',
                ]),
                name='moving_payments_status_check',
            ),
        ]


class MoverPayout(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    booking_id = models.UUIDField()
    mover_id = models.UUIDField()
    mover_name = models.TextField(default='')
    national_id = models.TextField(default='')
    payment_channel = models.TextField()
    renter_payment = models.DecimalField(max_digits=14, decimal_places=2)
    platform_deduction = models.DecimalField(max_digits=14, decimal_places=2)
    net_mover_payable = models.DecimalField(max_digits=14, decimal_places=2)
    down_payment_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    final_payment_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    down_payment_status = models.TextField(default='held')
    final_payment_status = models.TextField(default='held')
    job_started_at = models.DateTimeField(null=True, blank=True)
    delivery_confirmed_at = models.DateTimeField(null=True, blank=True)
    down_payment_released_at = models.DateTimeField(null=True, blank=True)
    final_payment_released_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    payout_provider = models.TextField(null=True, blank=True)
    payout_provider_reference = models.TextField(null=True, blank=True)
    payout_provider_transaction_id = models.TextField(null=True, blank=True)
    payout_failure_reason = models.TextField(null=True, blank=True)
    payout_requested_at = models.DateTimeField(null=True, blank=True)
    payout_completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'mover_payouts'
        constraints = [
            models.CheckConstraint(condition=models.Q(renter_payment__gte=0), name='mover_payouts_renter_payment_check'),
            models.CheckConstraint(condition=models.Q(platform_deduction__gte=0), name='mover_payouts_platform_deduction_check'),
            models.CheckConstraint(condition=models.Q(net_mover_payable__gte=0), name='mover_payouts_net_mover_payable_check'),
            models.CheckConstraint(condition=models.Q(down_payment_amount__gte=0), name='mover_payouts_down_payment_amount_check'),
            models.CheckConstraint(condition=models.Q(final_payment_amount__gte=0), name='mover_payouts_final_payment_amount_check'),
            models.CheckConstraint(
                condition=models.Q(payment_channel__in=[
                    'mpesa_send_money', 'mpesa_paybill', 'mpesa_lipa_na_mpesa', 'airtel_money',
                ]),
                name='mover_payouts_payment_channel_check',
            ),
            models.CheckConstraint(
                condition=models.Q(down_payment_status__in=['held', 'released']),
                name='mover_payouts_down_payment_status_check',
            ),
            models.CheckConstraint(
                condition=models.Q(final_payment_status__in=['held', 'processing', 'failed', 'released']),
                name='mover_payouts_final_payment_status_check',
            ),
            models.UniqueConstraint(fields=['booking_id'], name='mover_payouts_booking_id_key'),
        ]
