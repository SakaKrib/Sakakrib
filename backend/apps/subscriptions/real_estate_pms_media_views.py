from pathlib import Path
import uuid

from django.core.files.storage import default_storage
from django.utils import timezone
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.domain_property import ListingMedia, PropertyUnit
from apps.listings.models import Listing
from apps.listings.serializers import ListingMediaSerializer

from .models import RealEstatePMSListingAssignment, RealEstatePMSMember
from .services import get_real_estate_pms_context

MAX_LISTING_PHOTOS = 7
MAX_LISTING_PHOTO_BYTES = 10 * 1024 * 1024
MAX_LISTING_VIDEO_BYTES = 100 * 1024 * 1024
ALLOWED_PHOTO_TYPES = {'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp'}
ALLOWED_VIDEO_TYPES = {'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov'}


def _authorized(user, listing, require_assignment=True):
    context = get_real_estate_pms_context(user)
    if not context or str(listing.user_id) != str(context['owner_id']):
        return None
    role = context.get('pms_role')
    if role in ('ADMIN', 'TEAM_MANAGER'):
        return context
    if role == 'AGENT' and RealEstatePMSListingAssignment.objects.filter(
        real_estate_id=context['owner_id'], listing_id=listing.id, agent_id=user.id, is_active=True
    ).exists():
        return context
    return None


def _listing(user, listing_id):
    listing = Listing.objects.filter(pk=listing_id, is_property_management=True).first()
    if not listing:
        return None, None
    return listing, _authorized(user, listing)


def _storage_path(media):
    value = media.url or ''
    return value[len('django-media://'):].lstrip('/') if value.startswith('django-media://') else None


class RealEstatePMSMediaView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def get(self, request):
        listing_id = request.query_params.get('listing_id')
        if not listing_id:
            return Response({'detail': 'listing_id is required.'}, status=400)
        listing, context = _listing(request.user, listing_id)
        if not listing or not context:
            return Response({'detail': 'Listing not found or not assigned to you.'}, status=404)
        queryset = ListingMedia.objects.filter(listing_id=listing.id).order_by('position', 'created_at')
        return Response(ListingMediaSerializer(queryset, many=True, context={'request': request}).data)

    def post(self, request):
        listing_id = request.data.get('listing_id')
        listing, context = _listing(request.user, listing_id)
        if not listing or not context:
            return Response({'detail': 'Listing not found or not assigned to you.'}, status=404)
        if context.get('read_only'):
            return Response({'detail': 'PMS is read-only during the subscription grace period.'}, status=403)
        file = request.FILES.get('file')
        if not file:
            return Response({'detail': 'Media file is required.'}, status=400)
        media_type = str(request.data.get('media_type') or 'photo').lower()
        unit_id = request.data.get('unit_id') or None
        if unit_id:
            unit = PropertyUnit.objects.filter(id=unit_id, listing_id=listing.id, user_id=context['owner_id']).first()
            if not unit:
                return Response({'detail': 'The selected property unit does not belong to this listing.'}, status=400)
        if media_type == 'photo':
            allowed_types, max_bytes = ALLOWED_PHOTO_TYPES, MAX_LISTING_PHOTO_BYTES
            photos = ListingMedia.objects.filter(listing_id=listing.id, media_type='photo', unit_id=unit_id)
            if photos.count() >= MAX_LISTING_PHOTOS:
                return Response({'detail': f'A {"unit" if unit_id else "listing"} may have at most {MAX_LISTING_PHOTOS} photos.'}, status=400)
        elif media_type == 'video':
            allowed_types, max_bytes = ALLOWED_VIDEO_TYPES, MAX_LISTING_VIDEO_BYTES
            if unit_id:
                return Response({'detail': 'Videos can only be attached to the listing, not to a unit.'}, status=400)
        else:
            return Response({'detail': 'media_type must be photo or video.'}, status=400)
        content_type = str(getattr(file, 'content_type', '') or '').lower()
        if content_type not in allowed_types:
            extension = Path(getattr(file, 'name', '') or '').suffix.lower()
            fallback = {'.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime'}
            content_type = fallback.get(extension, '')
        if content_type not in allowed_types:
            return Response({'detail': 'Unsupported media type.'}, status=400)
        if int(getattr(file, 'size', 0) or 0) <= 0 or int(file.size) > max_bytes:
            return Response({'detail': f'Media file exceeds the allowed size of {"10 MB" if media_type == "photo" else "100 MB"}.'}, status=400)
        extension = allowed_types[content_type]
        stem = ''.join(c if c.isalnum() or c in '-_' else '-' for c in Path(getattr(file, 'name', '') or 'media').stem)
        stem = '-'.join(part for part in stem.split('-') if part)[:80] or 'media'
        media_id = uuid.uuid4()
        storage_path = f'listing-media/{context["owner_id"]}/{listing.id}/{media_type}/{media_id}-{stem}{extension}'
        saved = default_storage.save(storage_path, file)
        try:
            media = ListingMedia.objects.create(
                id=media_id, listing_id=listing.id, user_id=context['owner_id'],
                url=f'django-media://{saved}', label=str(request.data.get('label') or '').strip(),
                media_type=media_type, position=int(request.data.get('position') or 0),
                unit_id=unit_id, created_at=timezone.now(),
            )
        except Exception:
            if default_storage.exists(saved):
                default_storage.delete(saved)
            raise
        return Response(ListingMediaSerializer(media, context={'request': request}).data, status=201)


class RealEstatePMSMediaUpdateView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, media_id):
        media = ListingMedia.objects.filter(pk=media_id).first()
        if not media:
            return Response({'detail': 'Media not found.'}, status=404)
        listing, context = _listing(request.user, media.listing_id)
        if not listing or not context:
            return Response({'detail': 'Media not found.'}, status=404)
        if context.get('read_only'):
            return Response({'detail': 'PMS is read-only during the subscription grace period.'}, status=403)
        if 'label' in request.data:
            media.label = str(request.data.get('label') or '').strip()
        if 'position' in request.data:
            try:
                media.position = max(0, int(request.data.get('position')))
            except (TypeError, ValueError):
                return Response({'detail': 'position must be an integer.'}, status=400)
        media.save(update_fields=['label', 'position'])
        return Response(ListingMediaSerializer(media, context={'request': request}).data)


class RealEstatePMSMediaDeleteView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, media_id):
        media = ListingMedia.objects.filter(pk=media_id).first()
        if not media:
            return Response({'detail': 'Media not found.'}, status=404)
        listing, context = _listing(request.user, media.listing_id)
        if not listing or not context:
            return Response({'detail': 'Media not found.'}, status=404)
        if context.get('pms_role') != 'ADMIN':
            return Response({'detail': 'Only the PMS administrator can delete listing media.'}, status=403)
        if context.get('read_only'):
            return Response({'detail': 'PMS is read-only during the subscription grace period.'}, status=403)
        path = _storage_path(media)
        if path and default_storage.exists(path):
            default_storage.delete(path)
        media.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
