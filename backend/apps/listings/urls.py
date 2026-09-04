from django.urls import path

from .admin_control_views import AdminListingControlView
from .admin_post_views import AdminListingPostOnBehalfView
from .ai_caption_views import ListingAiCaptionView
from .draft_views import ListingDraftDetailView, ListingDraftListView
from .media_delete_views import ListingMediaDeleteView
from .public_views import FeaturedListingsView
from .views import (
    AdminListingReviewView,
    ListingCreateView,
    ListingDetailView,
    ListingEntitlementView,
    ListingListView,
    ListingMediaDetailView,
    ListingMediaView,
    ListingPaymentIntentView,
)

urlpatterns = [
    path('entitlement/', ListingEntitlementView.as_view(), name='listing-entitlement'),
    path('drafts/', ListingDraftListView.as_view(), name='listing-draft-list-create'),
    path('drafts/<uuid:draft_id>/', ListingDraftDetailView.as_view(), name='listing-draft-detail'),
    path('media/', ListingMediaView.as_view(), name='listing-media'),
    path('media/<uuid:media_id>/delete/', ListingMediaDeleteView.as_view(), name='listing-media-delete'),
    path('media/<uuid:media_id>/', ListingMediaDetailView.as_view(), name='listing-media-detail'),
    path('featured/', FeaturedListingsView.as_view(), name='listing-featured'),
    path('', ListingListView.as_view(), name='listing-list'),
    path('create/', ListingCreateView.as_view(), name='listing-create'),
    path('payment-intents/', ListingPaymentIntentView.as_view(), name='listing-payment-intent-create'),
    path('payment-intents/<uuid:intent_id>/', ListingPaymentIntentView.as_view(), name='listing-payment-intent-detail'),
    path('admin/post-on-behalf/', AdminListingPostOnBehalfView.as_view(), name='admin-listing-post-on-behalf'),
    path('admin/<uuid:listing_id>/', AdminListingControlView.as_view(), name='admin-listing-control'),
    path('<uuid:listing_id>/ai-caption/', ListingAiCaptionView.as_view(), name='listing-ai-caption'),
    path('<uuid:listing_id>/', ListingDetailView.as_view(), name='listing-detail'),
    path('<uuid:listing_id>/review/', AdminListingReviewView.as_view(), name='admin-listing-review'),
]
