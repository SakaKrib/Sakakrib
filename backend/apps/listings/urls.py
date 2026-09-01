from django.urls import path

from .views import (
    AdminListingReviewView,
    ListingCreateView,
    ListingDetailView,
    ListingEntitlementView,
    ListingListView,
    ListingPaymentIntentView,
)

urlpatterns = [
    path('entitlement/', ListingEntitlementView.as_view(), name='listing-entitlement'),
    path('', ListingListView.as_view(), name='listing-list'),
    path('create/', ListingCreateView.as_view(), name='listing-create'),
    path('payment-intents/', ListingPaymentIntentView.as_view(), name='listing-payment-intent-create'),
    path('payment-intents/<uuid:intent_id>/', ListingPaymentIntentView.as_view(), name='listing-payment-intent-detail'),
    path('<uuid:listing_id>/', ListingDetailView.as_view(), name='listing-detail'),
    path('<uuid:listing_id>/review/', AdminListingReviewView.as_view(), name='admin-listing-review'),
]
