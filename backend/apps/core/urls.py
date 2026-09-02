from django.urls import path
from .moving_views import BookingEventView, BookingView, MoverScheduleEventView, MoverView, MoverPayoutView, MovingCancellationEventView, MovingDisputeView, MovingInvoiceView, MovingPaymentView, MovingTrackingPointView
from .moving_action_views import MoverBookingRequestView, MoverBookingResponseView, MoverBookingDetailView, MoverQuoteView, MovingBookingCancelView
from .moving_payment_views import MovingEscrowReleaseView, MovingMpesaCallbackView, MovingMpesaStartView, MovingPaypalStartView, MovingPaypalWebhookView, MoverPayoutCallbackView, MovingDeliveryConfirmView, MovingDisputeOpenView, MovingDisputeResolveView
from .chat_views import ChatConversationView, ChatMessageView
from .chat_media_views import ChatMediaFileView, ChatMediaUploadView
from .notification_views import RenterNotificationView, UserNotificationView
from .rent_views import LandlordRentInvoiceCreateView, LandlordRentPaymentConfirmView, LandlordRentPaymentRejectView, RenterInvoicePaymentSubmitView, RenterPaidInvoiceCreateView
from .rent_reminder_views import RentPaymentReminderView
from .community_support_views import CommunityPostView, ReviewView, SupportTicketView, TermsAcceptanceView
from .renter_views import RenterDashboardView, RenterInvoiceView, RenterPaymentSubmissionView, RenterPaymentDestinationView, RenterRentSummaryView, RenterPaymentHistoryView, RenterMoverScheduleAvailabilityView, RenterInvitationClaimView, RenterInvitationCreateView, RenterInvitationPreviewView, RenterInvitationResendView, RenterInvitationCancelView
from .pms_views import PMSActionView, PMSDashboardView
from .payment_method_views import LandlordPaymentMethodView
from .rent_advance_views import LandlordMarkRentPaidThroughView, LandlordRentPaymentHistoryView, LandlordRentUnitView

urlpatterns = [
    path("bookings/", BookingView.as_view(), name="booking-list"), path("bookings/<uuid:object_id>/", BookingView.as_view(), name="booking-detail"),
    path("booking-events/", BookingEventView.as_view(), name="booking-event-list"), path("booking-events/<uuid:object_id>/", BookingEventView.as_view(), name="booking-event-detail"),
    path("movers/", MoverView.as_view(), name="mover-list"), path("movers/<uuid:object_id>/", MoverView.as_view(), name="mover-detail"),
    path("moving-invoices/", MovingInvoiceView.as_view(), name="moving-invoice-list"), path("moving-invoices/<uuid:object_id>/", MovingInvoiceView.as_view(), name="moving-invoice-detail"),
    path("moving-payments/", MovingPaymentView.as_view(), name="moving-payment-list"), path("moving-payments/<uuid:object_id>/", MovingPaymentView.as_view(), name="moving-payment-detail"),
    path("mover-payouts/", MoverPayoutView.as_view(), name="mover-payout-list"), path("mover-payouts/<uuid:object_id>/", MoverPayoutView.as_view(), name="mover-payout-detail"),
    path("moving-disputes/", MovingDisputeView.as_view(), name="moving-dispute-list"), path("moving-disputes/<uuid:object_id>/", MovingDisputeView.as_view(), name="moving-dispute-detail"),
    path("mover-schedule-events/", MoverScheduleEventView.as_view(), name="mover-schedule-event-list"), path("mover-schedule-events/<uuid:object_id>/", MoverScheduleEventView.as_view(), name="mover-schedule-event-detail"),
    path("moving-tracking-points/", MovingTrackingPointView.as_view(), name="moving-tracking-point-list"), path("moving-tracking-points/<int:object_id>/", MovingTrackingPointView.as_view(), name="moving-tracking-point-detail"),
    path("moving-cancellation-events/", MovingCancellationEventView.as_view(), name="moving-cancellation-event-list"), path("moving-cancellation-events/<uuid:object_id>/", MovingCancellationEventView.as_view(), name="moving-cancellation-event-detail"),
    path("movers/quote/", MoverQuoteView.as_view(), name="mover-quote"), path("bookings/request/", MoverBookingRequestView.as_view(), name="booking-request"),
    path("bookings/<uuid:booking_id>/detail/", MoverBookingDetailView.as_view(), name="mover-booking-detail"), path("bookings/<uuid:booking_id>/respond/", MoverBookingResponseView.as_view(), name="booking-response"), path("bookings/<uuid:booking_id>/cancel/", MovingBookingCancelView.as_view(), name="booking-cancel"),
    path("bookings/<uuid:booking_id>/payment/mpesa/start/", MovingMpesaStartView.as_view(), name="moving-payment-mpesa-start"), path("payments/moving/mpesa/callback/", MovingMpesaCallbackView.as_view(), name="moving-payment-mpesa-callback"),
    path("bookings/<uuid:booking_id>/payment/paypal/start/", MovingPaypalStartView.as_view(), name="moving-payment-paypal-start"), path("payments/moving/paypal/webhook/", MovingPaypalWebhookView.as_view(), name="moving-payment-paypal-webhook"),
    path("bookings/<uuid:booking_id>/escrow/release/", MovingEscrowReleaseView.as_view(), name="moving-escrow-release"), path("payments/mover-payout/callback/", MoverPayoutCallbackView.as_view(), name="mover-payout-callback"),
    path("bookings/<uuid:booking_id>/delivery/confirm/", MovingDeliveryConfirmView.as_view(), name="moving-delivery-confirm"), path("bookings/<uuid:booking_id>/disputes/", MovingDisputeOpenView.as_view(), name="moving-dispute-open"), path("moving-disputes/<uuid:dispute_id>/resolve/", MovingDisputeResolveView.as_view(), name="moving-dispute-resolve"),
    path("chat/", ChatConversationView.as_view(), name="chat-conversation"), path("chat/message/", ChatMessageView.as_view(), name="chat-message"),
    path("chat/media/", ChatMediaUploadView.as_view(), name="chat-media-upload"), path("chat/media/<str:token>/", ChatMediaFileView.as_view(), name="chat-media-file"),
    path("notifications/", UserNotificationView.as_view(), name="user-notifications"), path("renter-notifications/", RenterNotificationView.as_view(), name="renter-notifications"),
    path("renter/dashboard/", RenterDashboardView.as_view(), name="renter-dashboard"),
    path("renter/invoices/", RenterInvoiceView.as_view(), name="renter-invoice-list"), path("renter/invoices/<uuid:invoice_id>/", RenterInvoiceView.as_view(), name="renter-invoice-detail"),
    path("renter/invoices/<uuid:invoice_id>/submissions/", RenterPaymentSubmissionView.as_view(), name="renter-payment-submissions"),
    path("renter/payment-destination/", RenterPaymentDestinationView.as_view(), name="renter-payment-destination"),
    path("renter/rent-summary/", RenterRentSummaryView.as_view(), name="renter-rent-summary"),
    path("renter/payment-history/", RenterPaymentHistoryView.as_view(), name="renter-payment-history"),
    path("renter/mover-schedule-availability/", RenterMoverScheduleAvailabilityView.as_view(), name="renter-mover-schedule-availability"),
    path("pms/dashboard/", PMSDashboardView.as_view(), name="pms-dashboard"), path("pms/action/", PMSActionView.as_view(), name="pms-action"),
    path("payment-methods/", LandlordPaymentMethodView.as_view(), name="landlord-payment-method-create"), path("payment-methods/<uuid:payment_method_id>/", LandlordPaymentMethodView.as_view(), name="landlord-payment-method-delete"),
    path("rent/units/", LandlordRentUnitView.as_view(), name="landlord-rent-units"), path("rent/units/<uuid:unit_id>/history/", LandlordRentPaymentHistoryView.as_view(), name="landlord-rent-payment-history"), path("rent/units/<uuid:unit_id>/paid-through/", LandlordMarkRentPaidThroughView.as_view(), name="landlord-rent-paid-through"),
    path("invoices/landlord/", LandlordRentInvoiceCreateView.as_view(), name="rent-invoice-create-landlord"), path("invoices/renter/paid/", RenterPaidInvoiceCreateView.as_view(), name="rent-invoice-create-renter-paid"), path("invoices/<uuid:invoice_id>/submit-payment/", RenterInvoicePaymentSubmitView.as_view(), name="rent-invoice-submit-payment"), path("payment-submissions/<uuid:submission_id>/confirm/", LandlordRentPaymentConfirmView.as_view(), name="rent-payment-confirm"), path("payment-submissions/<uuid:submission_id>/reject/", LandlordRentPaymentRejectView.as_view(), name="rent-payment-reject"),
    path("rent-reminders/<uuid:renter_assoc_id>/send/", RentPaymentReminderView.as_view(), name="rent-payment-reminder-send"),
    path("community-posts/", CommunityPostView.as_view(), name="community-post-list"), path("community-posts/<uuid:object_id>/", CommunityPostView.as_view(), name="community-post-detail"),
    path("reviews/", ReviewView.as_view(), name="review-list"), path("reviews/<uuid:object_id>/", ReviewView.as_view(), name="review-detail"),
    path("support-tickets/", SupportTicketView.as_view(), name="support-ticket-list"), path("support-tickets/<uuid:object_id>/", SupportTicketView.as_view(), name="support-ticket-detail"),
    path("terms-acceptance/", TermsAcceptanceView.as_view(), name="terms-acceptance-list"), path("terms-acceptance/<uuid:object_id>/", TermsAcceptanceView.as_view(), name="terms-acceptance-detail"),
    path("renter-invitations/", RenterInvitationCreateView.as_view(), name="renter-invitation-create"),
    path("renter-invitations/<uuid:association_id>/resend/", RenterInvitationResendView.as_view(), name="renter-invitation-resend"),
    path("renter-invitations/<uuid:association_id>/cancel/", RenterInvitationCancelView.as_view(), name="renter-invitation-cancel"),
    path("renter-invitations/<str:token>/preview/", RenterInvitationPreviewView.as_view(), name="renter-invitation-preview"),
    path("renter-invitations/<str:token>/claim/", RenterInvitationClaimView.as_view(), name="renter-invitation-claim"),
]