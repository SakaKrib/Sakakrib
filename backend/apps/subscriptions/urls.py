from django.urls import path

from .pms_access_views import MyPMSAccessView
from .pms_units_views import MyPMSUnitsView
from .real_estate_pms_media_views import RealEstatePMSMediaDeleteView, RealEstatePMSMediaUpdateView, RealEstatePMSMediaView
from .real_estate_pms_views import RealEstatePMSListingAssignmentsView, RealEstatePMSTeamView
from .real_estate_pms_unit_views import RealEstatePMSUnitView
from .renewal_views import SubscriptionRenewalView
from .upgrade_views import SubscriptionUpgradeView
from .views import (
    MpesaSubscriptionCallbackView,
    MyAvailablePMSListingsView,
    MyPMSListingsView,
    MyPMSUnitCountView,
    MySubscriptionAccessView,
    MySubscriptionInvoiceView,
    MySubscriptionInvoicesView,
    MySubscriptionView,
    PMSListingMembershipView,
    PayPalSubscriptionApproveView,
    PayPalSubscriptionWebhookView,
    SubscriptionCheckoutView,
    SubscriptionPlansView,
)

urlpatterns = [
    path('plans/', SubscriptionPlansView.as_view(), name='subscription-plans'),
    path('me/', MySubscriptionView.as_view(), name='my-subscription'),
    path('me/access/', MySubscriptionAccessView.as_view(), name='my-subscription-access'),
    path('me/pms-access/', MyPMSAccessView.as_view(), name='my-pms-access'),
    path('me/pms-listings/', MyPMSListingsView.as_view(), name='my-pms-listings'),
    path('me/pms-listings/available/', MyAvailablePMSListingsView.as_view(), name='my-available-pms-listings'),
    path('me/pms-unit-count/', MyPMSUnitCountView.as_view(), name='my-pms-unit-count'),
    path('me/pms-units/', MyPMSUnitsView.as_view(), name='my-pms-units'),
    path('me/pms-listings/membership/', PMSListingMembershipView.as_view(), name='pms-listing-membership'),
    path('real-estate/team/', RealEstatePMSTeamView.as_view(), name='real-estate-pms-team'),
    path('real-estate/listing-assignments/', RealEstatePMSListingAssignmentsView.as_view(), name='real-estate-pms-listing-assignments'),
    path('real-estate/units/', RealEstatePMSUnitView.as_view(), name='real-estate-pms-unit-list-create'),
    path('real-estate/units/<uuid:unit_id>/', RealEstatePMSUnitView.as_view(), name='real-estate-pms-unit-detail'),
    path('real-estate/media/', RealEstatePMSMediaView.as_view(), name='real-estate-pms-media'),
    path('real-estate/media/<uuid:media_id>/update/', RealEstatePMSMediaUpdateView.as_view(), name='real-estate-pms-media-update'),
    path('real-estate/media/<uuid:media_id>/delete/', RealEstatePMSMediaDeleteView.as_view(), name='real-estate-pms-media-delete'),
    path('invoices/', MySubscriptionInvoicesView.as_view(), name='subscription-invoices'),
    path('invoices/<uuid:invoice_id>/', MySubscriptionInvoiceView.as_view(), name='subscription-invoice-detail'),
    path('checkout/', SubscriptionCheckoutView.as_view(), name='subscription-checkout'),
    path('renew/', SubscriptionRenewalView.as_view(), name='subscription-renewal'),
    path('upgrade/', SubscriptionUpgradeView.as_view(), name='subscription-upgrade'),
    path('paypal/approve/', PayPalSubscriptionApproveView.as_view(), name='paypal-subscription-approve'),
    path('callbacks/mpesa/', MpesaSubscriptionCallbackView.as_view(), name='mpesa-subscription-callback'),
    path('paypal/webhook/', PayPalSubscriptionWebhookView.as_view(), name='paypal-subscription-webhook'),
]
