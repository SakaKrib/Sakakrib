from django.db.models import Count
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import Profile
from apps.core.domain_platform import Mover
from apps.core.domain_property import ListingMedia, Review
from apps.listings.models import Listing


def _public_listings():
    """Listings any visitor may see: approved, published and not a draft."""
    return Listing.objects.filter(approval_status='approved', is_published=True, is_draft=False)


def _approved_profiles(role, application_field):
    return Profile.objects.filter(
        role=role,
        email_verified=True,
        is_active=True,
        **{application_field: 'approved'},
    )


class HomepageStatsView(APIView):
    """Public aggregate statistics used by the anonymous homepage."""

    permission_classes = [AllowAny]

    def get(self, request):
        return Response({
            'listings': _public_listings().count(),
            'landlords': _approved_profiles('landlord', 'landlord_application_status').count(),
            'real_estates': _approved_profiles('real_estate', 'real_estate_application_status').count(),
            'movers': Mover.objects.filter(
                approval_status='approved',
                is_available=True,
            ).count(),
            'reviews': Review.objects.count(),
        })


class RealEstateDirectoryView(APIView):
    """Public list of approved real-estate accounts for the homepage section."""

    permission_classes = [AllowAny]
    LIMIT = 12

    def get(self, request):
        agencies = list(
            _approved_profiles('real_estate', 'real_estate_application_status')
            .order_by('-created_at')[: self.LIMIT]
        )
        ids = [agency.id for agency in agencies]

        counts = {
            row['user_id']: row['total']
            for row in _public_listings()
            .filter(user_id__in=ids)
            .values('user_id')
            .annotate(total=Count('id'))
        }

        results = []
        for agency in agencies:
            latest = _public_listings().filter(user_id=agency.id).order_by('-created_at').first()
            cover = None
            if latest:
                photo = (
                    ListingMedia.objects
                    .filter(listing_id=latest.id, media_type='photo', unit_id__isnull=True)
                    .order_by('position', 'created_at')
                    .first()
                )
                if photo:
                    cover = f'/api/listings/media/{photo.id}/'
            results.append({
                'id': str(agency.id),
                'name': (agency.full_name or '').strip() or 'Real estate agency',
                'city': agency.city or None,
                'county': agency.county or None,
                'is_agency': bool(agency.is_agency),
                'listings_count': counts.get(agency.id, 0),
                'cover_image_url': cover,
            })

        return Response({'count': len(results), 'results': results})
