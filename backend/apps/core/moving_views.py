from django.db.models import Q
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.authorization import is_admin

from .access_scopes import (
    booking_events_for_user,
    bookings_for_user,
    moving_disputes_for_user,
    moving_invoices_for_user,
    moving_payments_for_user,
    mover_payouts_for_user,
    movers_for_user,
)
from .domain_bookings import (
    Booking,
    BookingEvent,
    MovingCancellationEvent,
    MovingDispute,
    MovingInvoice,
    MovingPayment,
    MovingTrackingPoint,
    MoverPayout,
    MoverScheduleEvent,
)
from .domain_platform import Mover


class ScopedListDetailView(APIView):
    permission_classes = [IsAuthenticated]
    model = None
    scope = None
    fields = ()

    def get_queryset(self):
        return self.scope(self.request.user)

    def serialize(self, obj):
        return {field: getattr(obj, field) for field in self.fields}

    def get(self, request, object_id=None):
        queryset = self.get_queryset()
        if object_id is not None:
            obj = queryset.filter(pk=object_id).first()
            if obj is None:
                return Response({"detail": "Not found."}, status=404)
            return Response(self.serialize(obj))
        return Response([self.serialize(obj) for obj in queryset.order_by("-id")])


BOOKING_FIELDS = (
    "id", "renter_id", "mover_id", "listing_id", "pickup_address", "dropoff_address",
    "moving_date", "booking_amount", "commission_amount", "total_amount", "status",
    "payment_status", "payment_method", "created_at", "updated_at", "distance_km",
    "rate_per_km_kes", "base_rate_kes", "pickup_latitude", "pickup_longitude",
    "dropoff_latitude", "dropoff_longitude", "requested_at", "request_expires_at",
    "confirmed_at", "scheduled_start_at", "scheduled_end_at", "started_at", "completed_at",
    "cancelled_at", "cancellation_reason", "cancellation_details", "tracking_number",
    "renter_confirmed_delivery_at", "contact_released_at", "last_known_latitude",
    "last_known_longitude", "last_location_at", "mover_confirmed_delivery_at", "dispute_status",
)

BOOKING_EVENT_FIELDS = (
    "id", "conversation_id", "renter_id", "mover_id", "mover_profile_id", "relocation_date",
    "day_of_week", "pickup_time", "pickup_address", "dropoff_address", "negotiated_price",
    "commission_amount", "total_amount", "status", "payment_method", "created_at",
    "confirmed_at", "paid_at", "distance_km", "rate_per_km_kes", "base_rate_kes",
)

MOVER_FIELDS = (
    "id", "user_id", "driver_full_name", "vehicle_type", "number_plate", "operating_city",
    "operating_county", "phone", "profile_photo_url", "base_rate_kes", "is_available",
    "created_at", "updated_at", "business_name", "working_days", "start_time", "end_time",
    "payment_channel", "liability_accepted", "reference_contacts", "approval_status",
    "rate_per_km_kes", "insurance_policy_details", "vehicle_inspection_expiry",
    "terms_accepted", "current_latitude", "current_longitude", "location_updated_at",
    "location", "capacity_details",
)

MOVING_INVOICE_FIELDS = (
    "id", "booking_id", "invoice_number", "renter_id", "mover_id", "amount_kes",
    "platform_fee_kes", "mover_net_kes", "currency", "status", "payment_provider",
    "provider_reference", "provider_transaction_id", "paid_at", "released_at",
    "mover_name_snapshot", "mover_phone_snapshot", "vehicle_type_snapshot",
    "number_plate_snapshot", "mover_profile_photo_snapshot", "created_at", "updated_at",
)

MOVING_PAYMENT_FIELDS = (
    "id", "booking_id", "invoice_id", "payer_id", "amount_kes", "provider", "status",
    "provider_reference", "provider_transaction_id", "mpesa_receipt", "paypal_order_id",
    "provider_amount", "provider_currency", "created_at", "paid_at", "released_at", "updated_at",
)

MOVER_PAYOUT_FIELDS = (
    "id", "booking_id", "mover_id", "mover_name", "national_id", "payment_channel",
    "renter_payment", "platform_deduction", "net_mover_payable", "down_payment_amount",
    "final_payment_amount", "down_payment_status", "final_payment_status", "job_started_at",
    "delivery_confirmed_at", "down_payment_released_at", "final_payment_released_at",
    "created_at", "updated_at", "payout_provider", "payout_provider_reference",
    "payout_provider_transaction_id", "payout_failure_reason", "payout_requested_at",
    "payout_completed_at",
)

MOVING_DISPUTE_FIELDS = (
    "id", "booking_id", "opened_by", "reason_code", "description", "status",
    "resolution_code", "resolution_notes", "resolved_by", "opened_at", "resolved_at",
    "created_at", "updated_at",
)


class BookingView(ScopedListDetailView):
    model = Booking
    scope = staticmethod(bookings_for_user)
    fields = BOOKING_FIELDS


class BookingEventView(ScopedListDetailView):
    model = BookingEvent
    scope = staticmethod(booking_events_for_user)
    fields = BOOKING_EVENT_FIELDS


class MoverView(ScopedListDetailView):
    model = Mover
    scope = staticmethod(movers_for_user)
    fields = MOVER_FIELDS


class MovingInvoiceView(ScopedListDetailView):
    model = MovingInvoice
    scope = staticmethod(moving_invoices_for_user)
    fields = MOVING_INVOICE_FIELDS


class MovingPaymentView(ScopedListDetailView):
    model = MovingPayment
    scope = staticmethod(moving_payments_for_user)
    fields = MOVING_PAYMENT_FIELDS


class MoverPayoutView(ScopedListDetailView):
    model = MoverPayout
    scope = staticmethod(mover_payouts_for_user)
    fields = MOVER_PAYOUT_FIELDS


class MovingDisputeView(ScopedListDetailView):
    model = MovingDispute
    scope = staticmethod(moving_disputes_for_user)
    fields = MOVING_DISPUTE_FIELDS


class MoverScheduleEventView(APIView):
    """Matches production schedule SELECT: mover owner or renter of booking."""
    permission_classes = [IsAuthenticated]

    fields = (
        "id", "mover_id", "booking_id", "starts_at", "ends_at", "status", "title",
        "created_at", "updated_at",
    )

    def get(self, request, object_id=None):
        user = request.user
        mover_ids = Mover.objects.filter(user_id=user.pk).values("id")
        renter_booking_ids = Booking.objects.filter(renter_id=user.pk).values("id")
        queryset = MoverScheduleEvent.objects.filter(
            Q(mover_id__in=mover_ids) | Q(booking_id__in=renter_booking_ids)
        )
        if object_id is not None:
            obj = queryset.filter(pk=object_id).first()
            if obj is None:
                return Response({"detail": "Not found."}, status=404)
            return Response({field: getattr(obj, field) for field in self.fields})
        return Response([
            {field: getattr(obj, field) for field in self.fields}
            for obj in queryset.order_by("-starts_at")
        ])


class MovingTrackingPointView(APIView):
    """Matches production tracking SELECT: active/completed booking participant or admin."""
    permission_classes = [IsAuthenticated]

    fields = (
        "id", "booking_id", "mover_id", "latitude", "longitude", "accuracy_meters",
        "speed_kph", "heading_degrees", "recorded_at",
    )

    def get(self, request, object_id=None):
        user = request.user
        mover_ids = Mover.objects.filter(user_id=user.pk).values("id")
        participant_bookings = Booking.objects.filter(
            Q(renter_id=user.pk) | Q(mover_id__in=mover_ids),
            status__in=["in_progress", "completed"],
        ).values("id")
        queryset = MovingTrackingPoint.objects.filter(booking_id__in=participant_bookings)
        if is_admin(user):
            queryset = MovingTrackingPoint.objects.filter(
                booking_id__in=Booking.objects.filter(
                    status__in=["in_progress", "completed"]
                ).values("id")
            )
        if object_id is not None:
            obj = queryset.filter(pk=object_id).first()
            if obj is None:
                return Response({"detail": "Not found."}, status=404)
            return Response({field: getattr(obj, field) for field in self.fields})
        return Response([
            {field: getattr(obj, field) for field in self.fields}
            for obj in queryset.order_by("-recorded_at")
        ])


class MovingCancellationEventView(APIView):
    """Matches production cancellation SELECT: actor or booking participant."""
    permission_classes = [IsAuthenticated]

    fields = (
        "id", "booking_id", "cancelled_by", "reason_code", "reason_text", "created_at",
    )

    def get(self, request, object_id=None):
        user = request.user
        mover_ids = Mover.objects.filter(user_id=user.pk).values("id")
        participant_booking_ids = Booking.objects.filter(
            Q(renter_id=user.pk) | Q(mover_id__in=mover_ids)
        ).values("id")
        queryset = MovingCancellationEvent.objects.filter(
            Q(cancelled_by=user.pk) | Q(booking_id__in=participant_booking_ids)
        )
        if object_id is not None:
            obj = queryset.filter(pk=object_id).first()
            if obj is None:
                return Response({"detail": "Not found."}, status=404)
            return Response({field: getattr(obj, field) for field in self.fields})
        return Response([
            {field: getattr(obj, field) for field in self.fields}
            for obj in queryset.order_by("-created_at")
        ])
