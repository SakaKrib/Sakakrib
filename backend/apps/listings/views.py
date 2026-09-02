from decimal import Decimal, InvalidOperation
import uuid
from pathlib import Path

from django.core.files.storage import default_storage
from django.core.exceptions import PermissionDenied
from django.db.models import Q
from django.http import FileResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.authorization import is_admin
from apps.core.domain_property import ListingMedia, PropertyUnit

from .models import Listing, ListingPaymentIntent
from .review_services import review_listing
from .serializers import ListingCreateSerializer, ListingMediaSerializer, ListingSerializer, ListingUpdateSerializer
from .services import create_listing, create_listing_payment_intent, get_listing_entitlement

MAX_LISTING_PHOTOS = 7
MAX_LISTING_PHOTO_BYTES = 10 * 1024 * 1024
MAX_LISTING_VIDEO_BYTES = 100 * 1024 * 1024
ALLOWED_PHOTO_TYPES = {'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp'}
ALLOWED_VIDEO_TYPES = {'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov'}


def _media_is_visible(request, media):
    if is_admin(request.user) or str(media.user_id) == str(request.user.pk):
        return True
    return Listing.objects.filter(id=media.listing_id, approval_status='approved', is_published=True).exists()


def _media_storage_path(media):
    value = media.url or ''
    if not value.startswith('django-media://'):
        return None
    return value[len('django-media://'):].lstrip('/')


class ListingMediaView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def get(self, request):
        queryset = ListingMedia.objects.all()
        listing_id = request.query_params.get('listing_id')
        if listing_id:
            queryset = queryset.filter(listing_id=listing_id)
        if not is_admin(request.user):
            queryset = queryset.filter(Q(user_id=request.user.pk) | Q(listing_id__in=Listing.objects.filter(approval_status='approved', is_published=True).values_list('id', flat=True)))
        queryset = queryset.order_by('position', 'created_at')
        return Response(ListingMediaSerializer(queryset, many=True, context={'request': request}).data)

    def post(self, request):
        listing_id = request.data.get('listing_id')
        if not listing_id:
            return Response({'detail': 'listing_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
        listing = Listing.objects.filter(id=listing_id, user_id=request.user.pk).first()
        if not listing:
            return Response({'detail': 'You may only add media to your own listing.'}, status=status.HTTP_403_FORBIDDEN)
        file = request.FILES.get('file')
        if not file:
            return Response({'detail': 'Media file is required.'}, status=status.HTTP_400_BAD_REQUEST)
        media_type = str(request.data.get('media_type') or 'photo').lower()
        if media_type == 'photo':
            allowed_types, max_bytes = ALLOWED_PHOTO_TYPES, MAX_LISTING_PHOTO_BYTES
            if ListingMedia.objects.filter(listing_id=listing.id, media_type='photo').count() >= MAX_LISTING_PHOTOS:
                return Response({'detail': f'A listing may have at most {MAX_LISTING_PHOTOS} photos.'}, status=status.HTTP_400_BAD_REQUEST)
        elif media_type == 'video':
            allowed_types, max_bytes = ALLOWED_VIDEO_TYPES, MAX_LISTING_VIDEO_BYTES
        else:
            return Response({'detail': 'media_type must be photo or video.'}, status=status.HTTP_400_BAD_REQUEST)
        content_type = str(getattr(file, 'content_type', '') or '').lower()
        if content_type not in allowed_types:
            return Response({'detail': 'Unsupported media type.'}, status=status.HTTP_400_BAD_REQUEST)
        if int(getattr(file, 'size', 0) or 0) <= 0 or int(file.size) > max_bytes:
            return Response({'detail': 'Media file is too large.'}, status=status.HTTP_400_BAD_REQUEST)
        unit_id = request.data.get('unit_id') or None
        if unit_id:
            unit = PropertyUnit.objects.filter(id=unit_id, listing_id=listing.id, user_id=request.user.pk).first()
            if not unit:
                return Response({'detail': 'The selected property unit does not belong to this listing.'}, status=status.HTTP_400_BAD_REQUEST)
        extension = allowed_types[content_type]
        original_name = Path(getattr(file, 'name', '') or 'media').stem
        safe_name = ''.join(char if char.isalnum() or char in '-_' else '-' for char in original_name)
        safe_name = '-'.join(part for part in safe_name.split('-') if part)[:80] or 'media'
        media_id = uuid.uuid4()
        storage_path = f'listing-media/{request.user.pk}/{listing.id}/{media_type}/{media_id}-{safe_name}{extension}'
        saved_path = default_storage.save(storage_path, file)
        try:
            media = ListingMedia.objects.create(id=media_id, listing_id=listing.id, user_id=request.user.pk, url=f'django-media://{saved_path}', label=str(request.data.get('label') or '').strip(), media_type=media_type, position=int(request.data.get('position') or 0), unit_id=unit_id, created_at=timezone.now())
        except Exception:
            if default_storage.exists(saved_path): default_storage.delete(saved_path)
            raise
        return Response(ListingMediaSerializer(media, context={'request': request}).data, status=status.HTTP_201_CREATED)


class ListingMediaDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, media_id):
        media = ListingMedia.objects.filter(pk=media_id).first()
        if not media or not _media_is_visible(request, media):
            return Response({'detail': 'Media not found.'}, status=status.HTTP_404_NOT_FOUND)
        storage_path = _media_storage_path(media)
        if not storage_path: return Response({'url': media.url}, status=status.HTTP_200_OK)
        if not default_storage.exists(storage_path): return Response({'detail': 'Media file not found.'}, status=status.HTTP_404_NOT_FOUND)
        file_obj = default_storage.open(storage_path, 'rb')
        extension = storage_path.rsplit('.', 1)[-1].lower() if '.' in storage_path else ''
        content_type = {'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'webp': 'image/webp', 'mp4': 'video/mp4', 'webm': 'video/webm', 'mov': 'video/quicktime'}.get(extension, 'application/octet-stream')
        response = FileResponse(file_obj, content_type=content_type); response['Content-Disposition'] = 'inline'; response['Cache-Control'] = 'private, max-age=300'; return response

    def delete(self, request, media_id):
        media = ListingMedia.objects.filter(pk=media_id).first()
        if not media: return Response({'detail': 'Media not found.'}, status=status.HTTP_404_NOT_FOUND)
        if not (is_admin(request.user) or str(media.user_id) == str(request.user.pk)):
            return Response({'detail': 'You may only delete your own listing media.'}, status=status.HTTP_403_FORBIDDEN)
        storage_path = _media_storage_path(media)
        if storage_path and default_storage.exists(storage_path): default_storage.delete(storage_path)
        media.delete(); return Response(status=status.HTTP_204_NO_CONTENT)


class ListingEntitlementView(APIView):
    permission_classes = [IsAuthenticated]
    def get(self, request): return Response(get_listing_entitlement(request.user))


class ListingCreateView(APIView):
    permission_classes = [IsAuthenticated]
    def post(self, request):
        serializer = ListingCreateSerializer(data=request.data); serializer.is_valid(raise_exception=True)
        result = create_listing(request.user, serializer.validated_data)
        if not result.get('listing_created'): return Response(result, status=402)
        return Response(result, status=201)


class ListingPaymentIntentView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        listing_id = request.data.get('listing_id')
        result = create_listing_payment_intent(request.user, request.data, listing_id=listing_id)
        return Response(result, status=201)

    def get(self, request, intent_id):
        intent = ListingPaymentIntent.objects.filter(pk=intent_id, user_id=request.user.pk).first()
        if not intent: return Response({'error': 'Listing payment intent not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response({'id': str(intent.id), 'status': intent.status, 'listing_id': str(intent.listing_id) if intent.listing_id else None, 'amount_kes': float(intent.amount_kes), 'provider': intent.provider, 'provider_reference': intent.provider_reference, 'provider_amount': float(intent.provider_amount) if intent.provider_amount is not None else None, 'provider_currency': intent.provider_currency, 'created_at': intent.created_at, 'paid_at': intent.paid_at, 'expires_at': intent.expires_at})


class ListingListView(APIView):
    """Production-equivalent listing read boundary plus simple search/filtering."""
    permission_classes = [IsAuthenticated]
    def get(self, request):
        user = request.user
        if not getattr(user, 'email_verified', False): return Response({'error': 'Email verification is required.'}, status=status.HTTP_403_FORBIDDEN)
        queryset = Listing.objects.all()
        requested_user_id = request.query_params.get('user_id')
        if requested_user_id:
            if not is_admin(user) and str(requested_user_id) != str(user.pk): return Response({'error': 'You may only query your own listings.'}, status=status.HTTP_403_FORBIDDEN)
            queryset = queryset.filter(user_id=requested_user_id)
        elif not is_admin(user): queryset = queryset.filter(Q(user_id=user.pk) | Q(approval_status='approved', is_published=True))
        queryset = self._apply_filters(queryset, request.query_params); total = queryset.count()
        try: limit = min(max(int(request.query_params.get('limit', 50)), 1), 100)
        except (TypeError, ValueError): return Response({'error': 'limit must be an integer.'}, status=400)
        try: offset = max(int(request.query_params.get('offset', 0)), 0)
        except (TypeError, ValueError): return Response({'error': 'offset must be an integer.'}, status=400)
        listings = queryset.order_by('-created_at')[offset:offset + limit]
        return Response({'count': total, 'limit': limit, 'offset': offset, 'results': ListingSerializer(listings, many=True, context={'request': request}).data})
    def post(self, request):
        serializer = ListingCreateSerializer(data=request.data); serializer.is_valid(raise_exception=True)
        result = create_listing(request.user, serializer.validated_data)
        if not result.get('listing_created'): return Response(result, status=402)
        return Response(result, status=201)
    @staticmethod
    def _apply_filters(queryset, params):
        city, county, property_type = params.get('city'), params.get('county'), params.get('property_type'); listing_type, query = params.get('listing_type'), params.get('q')
        if city: queryset = queryset.filter(city__iexact=city.strip())
        if county: queryset = queryset.filter(county__iexact=county.strip())
        if property_type: queryset = queryset.filter(property_type__iexact=property_type.strip())
        if listing_type:
            value = listing_type.strip().lower()
            if value not in {'rent', 'sale'}: return queryset.none()
            queryset = queryset.filter(listing_type=value)
        if query:
            term = query.strip()
            if term: queryset = queryset.filter(Q(title__icontains=term) | Q(description__icontains=term) | Q(city__icontains=term) | Q(county__icontains=term) | Q(location_search__icontains=term) | Q(property_name__icontains=term) | Q(property_type__icontains=term))
        queryset = ListingListView._decimal_filter(queryset, params, 'min_price', 'price_kes', 'gte'); queryset = ListingListView._decimal_filter(queryset, params, 'max_price', 'price_kes', 'lte'); queryset = ListingListView._int_filter(queryset, params, 'min_beds', 'beds', 'gte'); queryset = ListingListView._int_filter(queryset, params, 'min_baths', 'baths', 'gte'); return queryset
    @staticmethod
    def _decimal_filter(queryset, params, parameter, field, lookup):
        value = params.get(parameter)
        if not value: return queryset
        try: number = Decimal(value)
        except (InvalidOperation, TypeError, ValueError): return queryset.none()
        return queryset.filter(**{f'{field}__{lookup}': number})
    @staticmethod
    def _int_filter(queryset, params, parameter, field, lookup):
        value = params.get(parameter)
        if not value: return queryset
        try: number = int(value)
        except (TypeError, ValueError): return queryset.none()
        return queryset.filter(**{f'{field}__{lookup}': number})


class ListingDetailView(APIView):
    permission_classes = [IsAuthenticated]
    def _get_listing(self, request, listing_id):
        if not getattr(request.user, 'email_verified', False): return None, Response({'error': 'Email verification is required.'}, status=status.HTTP_403_FORBIDDEN)
        listing = Listing.objects.filter(pk=listing_id).first()
        if not listing: return None, Response({'error': 'Listing not found.'}, status=status.HTTP_404_NOT_FOUND)
        if not (is_admin(request.user) or str(listing.user_id) == str(request.user.pk) or (listing.approval_status == 'approved' and listing.is_published)): return None, Response({'error': 'You are not authorized to view this listing.'}, status=status.HTTP_404_NOT_FOUND)
        return listing, None
    def get(self, request, listing_id):
        listing, error = self._get_listing(request, listing_id)
        if error: return error
        return Response(ListingSerializer(listing, context={'request': request}).data)
    def patch(self, request, listing_id):
        listing, error = self._get_listing(request, listing_id)
        if error: return error
        if is_admin(request.user): allowed_to_update = True
        else:
            role = str(getattr(request.user, 'role', '') or '').lower()
            if role not in ('landlord', 'real_estate'): return Response({'error': 'Only landlord and real estate accounts may update listings.'}, status=status.HTTP_403_FORBIDDEN)
            if str(listing.user_id) != str(request.user.pk): return Response({'error': 'You may only update your own listing.'}, status=status.HTTP_403_FORBIDDEN)
            if not getattr(request.user, 'kyc_completed', False) or not getattr(request.user, 'email_verified', False): return Response({'error': 'Identity verification and email verification are required.'}, status=status.HTTP_403_FORBIDDEN)
            application_status = getattr(request.user, 'landlord_application_status', None) if role == 'landlord' else getattr(request.user, 'real_estate_application_status', None)
            if application_status != 'approved': return Response({'error': 'Application approval is required to update listings.'}, status=status.HTTP_403_FORBIDDEN)
            allowed_to_update = True
        if not allowed_to_update: return Response({'error': 'You are not authorized to update this listing.'}, status=status.HTTP_403_FORBIDDEN)
        serializer = ListingUpdateSerializer(listing, data=request.data, partial=True); serializer.is_valid(raise_exception=True); serializer.save(updated_at=timezone.now()); return Response(ListingSerializer(listing, context={'request': request}).data)
    def put(self, request, listing_id): return self.patch(request, listing_id)


class AdminListingReviewView(APIView):
    permission_classes = [IsAuthenticated]
    def post(self, request, listing_id):
        try: listing = review_listing(admin_user=request.user, listing_id=listing_id, decision=request.data.get('decision'), note=request.data.get('note', ''))
        except PermissionDenied as exc: return Response({'error': str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except LookupError as exc: return Response({'error': str(exc)}, status=status.HTTP_404_NOT_FOUND)
        except ValueError as exc: return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(ListingSerializer(listing, context={'request': request}).data)
