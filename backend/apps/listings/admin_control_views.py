from pathlib import Path

from django.core.exceptions import PermissionDenied
from django.core.files.storage import default_storage
from django.db import transaction
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.authorization import require_admin
from apps.core.domain_bookings import Booking
from apps.core.domain_property import ListingMedia

from .models import Listing


def _media_storage_path(url):
    value = str(url or '')
    if not value.startswith('django-media://'):
        return None
    return value[len('django-media://'):].lstrip('/')


class AdminListingControlView(APIView):
    """High-privilege listing controls for the administrator operations dashboard.

    This intentionally sits behind require_admin and does not weaken the normal
    landlord/real-estate listing API. Destructive deletion is refused while a
    listing has booking history, preventing an admin click from silently
    destroying a financial/fulfilment record.
    """
    permission_classes = [IsAuthenticated]

    def delete(self, request, listing_id):
        try:
            require_admin(request.user)
        except PermissionDenied as exc:
            return Response({'error': str(exc)}, status=403)

        with transaction.atomic():
            listing = Listing.objects.select_for_update().filter(pk=listing_id).first()
            if listing is None:
                return Response({'error': 'Listing not found.'}, status=404)

            booking_count = Booking.objects.filter(listing_id=listing.id).count()
            if booking_count:
                return Response(
                    {
                        'error': 'Listing cannot be permanently deleted because it has booking history.',
                        'booking_count': booking_count,
                        'alternative': 'Reject/unpublish the listing instead.',
                    },
                    status=409,
                )

            media = list(ListingMedia.objects.filter(listing_id=listing.id).values_list('url', flat=True))
            listing.delete()
            for url in media:
                storage_path = _media_storage_path(url)
                if storage_path and default_storage.exists(storage_path):
                    default_storage.delete(storage_path)

        return Response({'success': True, 'listing_id': str(listing_id), 'deleted_at': timezone.now()})
