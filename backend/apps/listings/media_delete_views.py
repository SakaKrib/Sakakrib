from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from .views import ListingMediaDetailView


class ListingMediaDeleteView(APIView):
    """Explicit action endpoint used by browser clients for media deletion.

    The actual authorization, storage cleanup, and database deletion remain in
    ListingMediaDetailView.delete so there is one authoritative delete path.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, media_id):
        return ListingMediaDetailView().delete(request, media_id)
