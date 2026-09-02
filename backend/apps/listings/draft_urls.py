from django.urls import path

from .draft_views import ListingDraftDetailView, ListingDraftListView

urlpatterns = [
    path('', ListingDraftListView.as_view(), name='listing-draft-list-create'),
    path('<uuid:draft_id>/', ListingDraftDetailView.as_view(), name='listing-draft-detail'),
]
