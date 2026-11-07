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
from rest_framework.permissions import AllowAny, IsAuthenticated
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
ALLOWED_PHOTO_EXTENSIONS = {'.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp'}
ALLOWED_VIDEO_TYPES = {'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov'}
ALLOWED_VIDEO_EXTENSIONS = {'.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime'}


def _media_is_public(media):
    """Photos of an approved, published, non-draft listing are public (the homepage shows them to anyone)."""
    return Listing.objects.filter(id=media.listing_id, approval_status='approved', is_published=True, is_draft=False).exists()


def _media_is_visible(request, media):
    if _media_is_public(media):
        return True
    user = request.user
    if not getattr(user, 'is_authenticated', False):
        return False
    return is_admin(user) or str(media.user_id) == str(user.pk)


def _media_storage_path(media):
    value = media.url or ''
    if not value.startswith('django-media://'):
        return None
    return value[len('django-media://'):].lstrip('/')


def _real_estate_pms_member_for_listing(user, listing):
    from apps.subscriptions.models import RealEstatePMSListingAssignment, RealEstatePMSMember, SubscriptionListing
    membership = RealEstatePMSMember.objects.filter(user_id=user.pk, real_estate_id=listing.user_id, status=RealEstatePMSMember.STATUS_ACTIVE).first()
    if not membership:
        return None
    if not SubscriptionListing.objects.filter(real_estate_subscription_id__in=__import__('apps.subscriptions.models', fromlist=['RealEstateSubscription']).RealEstateSubscription.objects.filter(real_estate_id=listing.user_id, status__in=['ACTIVE', 'GRACE_PERIOD']).values('id'), listing_id=listing.id, status='ACTIVE').exists():
        return None
    assignment = RealEstatePMSListingAssignment.objects.filter(real_estate_id=listing.user_id, listing_id=listing.id, agent_id=user.pk, is_active=True).exists()
    return membership if (membership.role == 'TEAM_MANAGER' or assignment) else None


class ListingMediaView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def get(self, request):
        queryset = ListingMedia.objects.all()
        listing_id = request.query_params.get('listing_id')
        if listing_id:
            queryset = queryset.filter(listing_id=listing_id)
        if not is_admin(request.user):
            queryset = queryset.filter(Q(user_id=request.user.pk) | Q(listing_id__in=Listing.objects.filter(approval_status='approved', is_published=True, is_draft=False).values_list('id', flat=True)))
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
        unit_id = request.data.get('unit_id') or None
        if unit_id:
            unit = PropertyUnit.objects.filter(id=unit_id, listing_id=listing.id, user_id=request.user.pk).first()
            if not unit:
                return Response({'detail': 'The selected property unit does not belong to this listing.'}, status=status.HTTP_400_BAD_REQUEST)
        if media_type == 'photo':
            allowed_types, max_bytes = ALLOWED_PHOTO_TYPES, MAX_LISTING_PHOTO_BYTES
            photo_qs = ListingMedia.objects.filter(listing_id=listing.id, media_type='photo')
            if unit_id:
                photo_qs = photo_qs.filter(unit_id=unit_id)
            else:
                photo_qs = photo_qs.filter(unit_id__isnull=True)
            if photo_qs.count() >= MAX_LISTING_PHOTOS:
                scope = 'unit' if unit_id else 'listing'
                return Response({'detail': f'A {scope} may have at most {MAX_LISTING_PHOTOS} photos.'}, status=status.HTTP_400_BAD_REQUEST)
        elif media_type == 'video':
            allowed_types, max_bytes = ALLOWED_VIDEO_TYPES, MAX_LISTING_VIDEO_BYTES
            if unit_id:
                return Response({'detail': 'Videos can only be attached to the listing, not to a unit.'}, status=status.HTTP_400_BAD_REQUEST)
        else:
            return Response({'detail': 'media_type must be photo or video.'}, status=status.HTTP_400_BAD_REQUEST)
        content_type = str(getattr(file, 'content_type', '') or '').lower()
        if content_type not in allowed_types:
            extension_hint = Path(getattr(file, 'name', '') or '').suffix.lower()
            fallback_map = ALLOWED_PHOTO_EXTENSIONS if media_type == 'photo' else ALLOWED_VIDEO_EXTENSIONS
            content_type = fallback_map.get(extension_hint, '')
        if content_type not in allowed_types:
            return Response({'detail': 'Unsupported media type. Use JPEG, PNG, or WebP for photos.' if media_type == 'photo' else 'Unsupported video type.'}, status=status.HTTP_400_BAD_REQUEST)
        if int(getattr(file, 'size', 0) or 0) <= 0:
            return Response({'detail': 'Media file is empty.'}, status=status.HTTP_400_BAD_REQUEST)
        if int(file.size) > max_bytes:
            limit_label = '10 MB' if media_type == 'photo' else '100 MB'
            return Response({'detail': f'Media file is too large. Maximum allowed size is {limit_label}.'}, status=status.HTTP_400_BAD_REQUEST)
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
    # Public listing photos must load on the anonymous homepage. The view's
    # _media_is_visible check still limits anonymous access to published listings.
    permission_classes = [AllowAny]

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
        response = FileResponse(file_obj, content_type=content_type); response['Content-Disposition'] = 'inline'; response['Cache-Control'] = 'public, max-age=3600' if _media_is_public(media) else 'private, max-age=300'; return response

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


PUBLIC_LISTING_FIELDS = (
    'id', 'title', 'city', 'county', 'property_type', 'price_kes', 'listing_type', 'size', 'beds', 'baths',
    'is_property_management', 'created_at', 'media', 'units',
)


class ListingListView(APIView):
    def get_permissions(self):
        # Anyone may browse the public feed; posting a listing still needs an account.
        return [AllowAny()] if self.request.method == 'GET' else [IsAuthenticated()]
    def get(self, request):
        user = request.user
        if not getattr(user, 'is_authenticated', False):
            # Guests get a trimmed, read-only card view of approved listings: no owner, contact or payment data.
            queryset = Listing.objects.filter(approval_status='approved', is_published=True, is_draft=False)
            queryset = self._apply_filters(queryset, request.query_params); total = queryset.count()
            try: limit = min(max(int(request.query_params.get('limit', 50)), 1), 100); offset = max(int(request.query_params.get('offset', 0)), 0)
            except (TypeError, ValueError): return Response({'error': 'limit and offset must be integers.'}, status=400)
            rows = ListingSerializer(queryset.order_by('-created_at')[offset:offset + limit], many=True, context={'request': request}).data
            return Response({'count': total, 'limit': limit, 'offset': offset, 'public': True, 'results': [{k: row.get(k) for k in PUBLIC_LISTING_FIELDS} for row in rows]})
        if not getattr(user, 'email_verified', False): return Response({'error': 'Email verification is required.'}, status=status.HTTP_403_FORBIDDEN)
        queryset = Listing.objects.all()
        requested_user_id = request.query_params.get('user_id')
        if requested_user_id:
            if not is_admin(user) and str(requested_user_id) != str(user.pk): return Response({'error': 'You may only query your own listings.'}, status=status.HTTP_403_FORBIDDEN)
            queryset = queryset.filter(user_id=requested_user_id)
        elif not is_admin(user):
            # The public feed ("View all") shows approved, published, non-draft listings only. A landlord's own
            # drafts and pending listings are reached with ?user_id=<own id> (dashboard / drafts).
            queryset = queryset.filter(approval_status='approved', is_published=True, is_draft=False)
        else:
            queryset = queryset.filter(is_draft=False)
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
        queryset = ListingListView._apply_price_filters(queryset, params); queryset = ListingListView._int_filter(queryset, params, 'min_beds', 'beds', 'gte'); queryset = ListingListView._int_filter(queryset, params, 'min_baths', 'baths', 'gte'); return queryset
    @staticmethod
    def _apply_price_filters(queryset, params):
        """Filter standalone listings by their price and multi-unit properties by unit rent."""
        min_raw, max_raw = params.get('min_price'), params.get('max_price')
        if not min_raw and not max_raw:
            return queryset
        try:
            minimum = Decimal(min_raw) if min_raw else None
            maximum = Decimal(max_raw) if max_raw else None
        except (InvalidOperation, TypeError, ValueError):
            return queryset.none()
        if minimum is not None and maximum is not None and minimum > maximum:
            return queryset.none()

        all_unit_listing_ids = PropertyUnit.objects.values('listing_id')
        parent_price_listings = queryset.exclude(
            Q(is_property_management=True) & Q(id__in=all_unit_listing_ids)
        )
        if minimum is not None:
            parent_price_listings = parent_price_listings.filter(price_kes__gte=minimum)
        if maximum is not None:
            parent_price_listings = parent_price_listings.filter(price_kes__lte=maximum)

        matching_units = PropertyUnit.objects.all()
        if minimum is not None:
            matching_units = matching_units.filter(rent__gte=minimum)
        if maximum is not None:
            matching_units = matching_units.filter(rent__lte=maximum)
        matching_unit_listing_ids = matching_units.values('listing_id')

        return queryset.filter(
            Q(id__in=parent_price_listings.values('id'))
            | Q(is_property_management=True, id__in=matching_unit_listing_ids)
        )
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
        if not (is_admin(request.user) or str(listing.user_id) == str(request.user.pk) or (listing.approval_status == 'approved' and listing.is_published)):
            return None, Response({'error': 'You are not authorized to view this listing.'}, status=status.HTTP_404_NOT_FOUND)
        return listing, None

    def get(self, request, listing_id):
        listing, error = self._get_listing(request, listing_id)
        if error: return error
        return Response(ListingSerializer(listing, context={'request': request}).data)

    def patch(self, request, listing_id):
        listing, error = self._get_listing(request, listing_id)
        if error: return error
        if is_admin(request.user):
            allowed_to_update = True
        else:
            role = str(getattr(request.user, 'role', '') or '').lower()
            if role in ('landlord', 'real_estate'):
                if str(listing.user_id) != str(request.user.pk): return Response({'error': 'You may only update your own listing.'}, status=status.HTTP_403_FORBIDDEN)
                if not getattr(request.user, 'kyc_completed', False) or not getattr(request.user, 'email_verified', False): return Response({'error': 'Identity verification and email verification are required.'}, status=status.HTTP_403_FORBIDDEN)
                application_status = getattr(request.user, 'landlord_application_status', None) if role == 'landlord' else getattr(request.user, 'real_estate_application_status', None)
                if application_status != 'approved': return Response({'error': 'Application approval is required to update listings.'}, status=status.HTTP_403_FORBIDDEN)
                allowed_to_update = True
            else:
                member = _real_estate_pms_member_for_listing(request.user, listing)
                if not member: return Response({'error': 'You are not authorized to update this listing.'}, status=status.HTTP_403_FORBIDDEN)
                allowed_to_update = True
        if not allowed_to_update: return Response({'error': 'You are not authorized to update this listing.'}, status=status.HTTP_403_FORBIDDEN)
        serializer = ListingUpdateSerializer(listing, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save(updated_at=timezone.now())
        return Response(ListingSerializer(listing, context={'request': request}).data)

    def put(self, request, listing_id): return self.patch(request, listing_id)

    def delete(self, request, listing_id):
        listing, error = self._get_listing(request, listing_id)
        if error: return error
        if is_admin(request.user):
            allowed = True
        elif str(getattr(request.user, 'role', '') or '').lower() == 'real_estate' and str(listing.user_id) == str(request.user.pk):
            allowed = True
        else:
            allowed = False
        if not allowed:
            return Response({'error': 'Only the Real Estate PMS administrator can delete this listing.'}, status=status.HTTP_403_FORBIDDEN)
        listing.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class AdminListingReviewView(APIView):
    permission_classes = [IsAuthenticated]
    def post(self, request, listing_id):
        try: listing = review_listing(admin_user=request.user, listing_id=listing_id, decision=request.data.get('decision'), note=request.data.get('note', ''))
        except PermissionDenied as exc: return Response({'error': str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except LookupError as exc: return Response({'error': str(exc)}, status=status.HTTP_404_NOT_FOUND)
        except ValueError as exc: return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(ListingSerializer(listing, context={'request': request}).data)