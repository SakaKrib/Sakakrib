from django.urls import path
from .views import (
    PaymentProviderConfigView,
    ListingPaymentStartView,
    MpesaListingCallbackView,
    PayPalListingCaptureView,
)

urlpatterns = [
    path('providers/', PaymentProviderConfigView.as_view(), name='payment-providers'),
    path('listing/start/', ListingPaymentStartView.as_view(), name='listing-payment-start'),
    path('listing/mpesa/callback/', MpesaListingCallbackView.as_view(), name='listing-mpesa-callback'),
    path('listing/paypal/capture/', PayPalListingCaptureView.as_view(), name='listing-paypal-capture'),
]
