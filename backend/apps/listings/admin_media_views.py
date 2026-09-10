import uuid
from pathlib import Path

from django.core.files.storage import default_storage
from django.core.exceptions import PermissionDenied
from django.utils import timezone
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.authorization import require_admin
from apps.core.domain_property import ListingMedia, PropertyUnit

from .models import Listing
from .serializers import ListingMediaSerializer

MAX_PHOTOS = 7
MAX_PHOTO_BYTES = 10 * 1024 * 1024
MAX_VIDEO_BYTES = 100 * 1024 * 1024
PHOTO_TYPES = {'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp'}
VIDEO_TYPES = {'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov'}


class AdminListingMediaUploadView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        try:
            require_admin(request.user)
        except PermissionDenied as exc:
            return Response({'error': str(exc)}, status=403)

        listing = Listing.objects.filter(
            pk=request.data.get('listing_id'),
            user_id=request.data.get('owner_id'),
        ).first()
        if not listing:
            return Response({'error': 'Listing or owner not found.'}, status=404)

        file = request.FILES.get('file')
        if not file:
            return Response({'error': 'Media file is required.'}, status=400)

        media_type = str(request.data.get('media_type') or 'photo').lower()
        unit_id = request.data.get('unit_id') or None
        unit = None
        if unit_id:
            unit = PropertyUnit.objects.filter(id=unit_id, listing_id=listing.id, user_id=listing.user_id).first()
            if not unit:
                return Response({'error': 'The selected unit does not belong to this listing.'}, status=400)

        if media_type == 'photo':
            allowed = PHOTO_TYPES
            max_bytes = MAX_PHOTO_BYTES
            photos = ListingMedia.objects.filter(listing_id=listing.id, media_type='photo')
            photos = photos.filter(unit_id=unit_id) if unit_id else photos.filter(unit_id__isnull=True)
            if photos.count() >= MAX_PHOTOS:
                return Response({'error': 'A listing or unit may have at most 7 photos.'}, status=400)
        elif media_type == 'video':
            if unit:
                return Response({'error': 'Videos can only be attached to the property listing.'}, status=400)
            allowed = VIDEO_TYPES
            max_bytes = MAX_VIDEO_BYTES
        else:
            return Response({'error': 'media_type must be photo or video.'}, status=400)

        content_type = str(getattr(file, 'content_type', '') or '').lower()
        if content_type not in allowed:
            suffix = Path(getattr(file, 'name', '') or '').suffix.lower()
            content_type = next((mime for mime, ext in allowed.items() if ext == suffix), '')
        if content_type not in allowed:
            return Response({'error': 'Unsupported media type.'}, status=400)
        if int(getattr(file, 'size', 0) or 0) <= 0:
            return Response({'error': 'Media file is empty.'}, status=400)
        if int(file.size) > max_bytes:
            return Response({'error': 'Media file is too large.'}, status=400)

        media_id = uuid.uuid4()
        original = Path(getattr(file, 'name', '') or 'media').stem
        safe = ''.join(ch if ch.isalnum() or ch in '-_' else '-' for ch in original)
        safe = '-'.join(part for part in safe.split('-') if part)[:80] or 'media'
        scope = f'unit-{unit_id}' if unit_id else 'property'
        storage_path = f'listing-media/{listing.user_id}/{listing.id}/admin/{scope}/{media_id}-{safe}{allowed[content_type]}'
        saved_path = default_storage.save(storage_path, file)
        try:
            media = ListingMedia.objects.create(
                id=media_id,
                listing_id=listing.id,
                user_id=listing.user_id,
                url=f'django-media://{saved_path}',
                label=str(request.data.get('label') or '').strip(),
                media_type=media_type,
                position=int(request.data.get('position') or 0),
                unit_id=unit_id,
                created_at=timezone.now(),
            )
        except Exception:
            if default_storage.exists(saved_path):
                default_storage.delete(saved_path)
            raise
        return Response(ListingMediaSerializer(media, context={'request': request}).data, status=201)
