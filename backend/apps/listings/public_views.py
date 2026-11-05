from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Listing
from .serializers import ListingSerializer


class FeaturedListingsView(APIView):
    """Public read-only featured listings for the homepage."""

    permission_classes = [AllowAny]

    def get(self, request):
        # Match the public listing criteria used by ListingListView.
        # approval_status + is_published are the canonical marketplace state;
        # is_approved is retained as a synchronized legacy compatibility field.
        queryset = Listing.objects.filter(
            approval_status='approved',
            is_published=True,
            is_draft=False,
        )

        city = str(request.query_params.get('city') or '').strip()
        listing_type = str(request.query_params.get('listing_type') or '').strip().lower()
        if city:
            queryset = queryset.filter(city__iexact=city)
        if listing_type in {'rent', 'sale'}:
            queryset = queryset.filter(listing_type=listing_type)

        listings = list(queryset.order_by('-created_at')[:12])
        return Response({
            'count': len(listings),
            'results': ListingSerializer(
                listings,
                many=True,
                context={'request': request},
            ).data,
        })
