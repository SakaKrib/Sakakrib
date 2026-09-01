from django.urls import path

from .moving_views import (
    BookingEventView,
    BookingView,
    MoverScheduleEventView,
    MoverView,
    MoverPayoutView,
    MovingCancellationEventView,
    MovingDisputeView,
    MovingInvoiceView,
    MovingPaymentView,
    MovingTrackingPointView,
)
from .rent_views import (
    LandlordRentInvoiceCreateView,
    LandlordRentPaymentConfirmView,
    LandlordRentPaymentRejectView,
    RenterInvoicePaymentSubmitView,
    RenterPaidInvoiceCreateView,
)

urlpatterns = [
    # Moving / booking read APIs. Querysets are constrained by the audited
    # production Supabase RLS rules before any object is returned.
    path("bookings/", BookingView.as_view(), name="booking-list"),
    path("bookings/<uuid:object_id>/", BookingView.as_view(), name="booking-detail"),
    path("booking-events/", BookingEventView.as_view(), name="booking-event-list"),
    path("booking-events/<uuid:object_id>/", BookingEventView.as_view(), name="booking-event-detail"),
    path("movers/", MoverView.as_view(), name="mover-list"),
    path("movers/<uuid:object_id>/", MoverView.as_view(), name="mover-detail"),
    path("moving-invoices/", MovingInvoiceView.as_view(), name="moving-invoice-list"),
    path("moving-invoices/<uuid:object_id>/", MovingInvoiceView.as_view(), name="moving-invoice-detail"),
    path("moving-payments/", MovingPaymentView.as_view(), name="moving-payment-list"),
    path("moving-payments/<uuid:object_id>/", MovingPaymentView.as_view(), name="moving-payment-detail"),
    path("mover-payouts/", MoverPayoutView.as_view(), name="mover-payout-list"),
    path("mover-payouts/<uuid:object_id>/", MoverPayoutView.as_view(), name="mover-payout-detail"),
    path("moving-disputes/", MovingDisputeView.as_view(), name="moving-dispute-list"),
    path("moving-disputes/<uuid:object_id>/", MovingDisputeView.as_view(), name="moving-dispute-detail"),
    path("mover-schedule-events/", MoverScheduleEventView.as_view(), name="mover-schedule-event-list"),
    path("mover-schedule-events/<uuid:object_id>/", MoverScheduleEventView.as_view(), name="mover-schedule-event-detail"),
    path("moving-tracking-points/", MovingTrackingPointView.as_view(), name="moving-tracking-point-list"),
    path("moving-tracking-points/<int:object_id>/", MovingTrackingPointView.as_view(), name="moving-tracking-point-detail"),
    path("moving-cancellation-events/", MovingCancellationEventView.as_view(), name="moving-cancellation-event-list"),
    path("moving-cancellation-events/<uuid:object_id>/", MovingCancellationEventView.as_view(), name="moving-cancellation-event-detail"),

    # External rent verification workflow.
    path("invoices/landlord/", LandlordRentInvoiceCreateView.as_view(), name="rent-invoice-create-landlord"),
    path("invoices/renter/paid/", RenterPaidInvoiceCreateView.as_view(), name="rent-invoice-create-renter-paid"),
    path("invoices/<uuid:invoice_id>/submit-payment/", RenterInvoicePaymentSubmitView.as_view(), name="rent-invoice-submit-payment"),
    path("payment-submissions/<uuid:submission_id>/confirm/", LandlordRentPaymentConfirmView.as_view(), name="rent-payment-confirm"),
    path("payment-submissions/<uuid:submission_id>/reject/", LandlordRentPaymentRejectView.as_view(), name="rent-payment-reject"),
]
