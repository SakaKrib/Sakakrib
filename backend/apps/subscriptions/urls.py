from django.urls import path

from .pms_access_views import MyPMSAccessView
from .pms_units_views import MyPMSUnitsView
from .views import (
    MpesaSubscriptionCallbackView,
    MyAvailablePMSListingsView,
    MyPMSListingsView,
    MyPMSUnitCountView,
    MySubscriptionAccessView,
    MySubscriptionInvoiceView,
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
    path('invoices/<uuid:invoice_id>/', MySubscriptionInvoiceView.as_view(), name='subscription-invoice-detail'),
    path('checkout/', SubscriptionCheckoutView.as_view(), name='subscription-checkout'),
    path('paypal/approve/', PayPalSubscriptionApproveView.as_view(), name='paypal-subscription-approve'),
    path('callbacks/mpesa/', MpesaSubscriptionCallbackView.as_view(), name='mpesa-subscription-callback'),
    path('callbacks/paypal/', PayPalSubscriptionWebhookView.as_view(), name='paypal-subscription-webhook'),
]
