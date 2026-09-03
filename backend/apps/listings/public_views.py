from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Listing
from .serializers import ListingSerializer


class FeaturedListingsView(APIView):
    """Public read-only featured listings for the homepage."""

    permission_classes = [AllowAny]

    def get(self, request):
        listings = Listing.objects.filter(
            is_published=True,
            is_approved=True,
        ).order_by('-created_at')[:12]
        return Response({
            'count': len(listings),
            'results': ListingSerializer(
                listings,
                many=True,
                context={'request': request},
            ).data,
        })
