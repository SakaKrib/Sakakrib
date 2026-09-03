from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import Profile
from apps.core.domain_platform import Mover
from apps.core.domain_property import Review
from apps.listings.models import Listing


class HomepageStatsView(APIView):
    """Public aggregate statistics used by the anonymous homepage."""

    permission_classes = [AllowAny]

    def get(self, request):
        return Response({
            'listings': Listing.objects.filter(
                is_published=True,
                is_approved=True,
            ).count(),
            'landlords': Profile.objects.filter(
                role='landlord',
                landlord_application_status='approved',
                email_verified=True,
                is_active=True,
            ).count(),
            'movers': Mover.objects.filter(
                approval_status='approved',
                is_available=True,
            ).count(),
            'reviews': Review.objects.count(),
        })
