from django.urls import path
from .views import ListingCreateView, ListingEntitlementView, ListingPaymentIntentView

urlpatterns = [
    path('entitlement/', ListingEntitlementView.as_view(), name='listing-entitlement'),
    path('', ListingCreateView.as_view(), name='listing-create'),
    path('payment-intents/', ListingPaymentIntentView.as_view(), name='listing-payment-intent'),
]
