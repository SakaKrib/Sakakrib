from decimal import Decimal, InvalidOperation

from django.db.models import Q
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.authorization import is_admin

from .models import Listing
from .review_services import review_listing
from .serializers import ListingCreateSerializer, ListingSerializer
from .services import create_listing, create_listing_payment_intent, get_listing_entitlement


class ListingEntitlementView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(get_listing_entitlement(request.user))


class ListingCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ListingCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = create_listing(request.user, serializer.validated_data)
        if not result.get('listing_created'):
            return Response(result, status=402)
        return Response(result, status=201)


class ListingPaymentIntentView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        result = create_listing_payment_intent(request.user, request.data)
        return Response(result, status=201)


class ListingListView(APIView):
    """Production-equivalent listing read boundary plus simple search/filtering."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        if not getattr(user, 'email_verified', False):
            return Response({'error': 'Email verification is required.'}, status=status.HTTP_403_FORBIDDEN)

        admin = is_admin(user)
        queryset = Listing.objects.all()
        if not admin:
            queryset = queryset.filter(
                Q(user_id=user.pk)
                | Q(approval_status='approved', is_published=True)
            )

        queryset = self._apply_filters(queryset, request.query_params)
        total = queryset.count()

        try:
            limit = min(max(int(request.query_params.get('limit', 50)), 1), 100)
        except (TypeError, ValueError):
            return Response({'error': 'limit must be an integer.'}, status=400)
        try:
            offset = max(int(request.query_params.get('offset', 0)), 0)
        except (TypeError, ValueError):
            return Response({'error': 'offset must be an integer.'}, status=400)

        listings = queryset.order_by('-created_at')[offset:offset + limit]
        return Response({
            'count': total,
            'limit': limit,
            'offset': offset,
            'results': ListingSerializer(listings, many=True).data,
        })

    @staticmethod
    def _apply_filters(queryset, params):
        city = params.get('city')
        county = params.get('county')
        property_type = params.get('property_type')
        listing_type = params.get('listing_type')
        query = params.get('q')

        if city:
            queryset = queryset.filter(city__iexact=city.strip())
        if county:
            queryset = queryset.filter(county__iexact=county.strip())
        if property_type:
            queryset = queryset.filter(property_type__iexact=property_type.strip())
        if listing_type:
            value = listing_type.strip().lower()
            if value not in {'rent', 'sale'}:
                return queryset.none()
            queryset = queryset.filter(listing_type=value)
        if query:
            term = query.strip()
            if term:
                queryset = queryset.filter(
                    Q(title__icontains=term)
                    | Q(description__icontains=term)
                    | Q(city__icontains=term)
                    | Q(county__icontains=term)
                    | Q(location_search__icontains=term)
                    | Q(property_name__icontains=term)
                    | Q(property_type__icontains=term)
                )

        queryset = ListingListView._decimal_filter(queryset, params, 'min_price', 'price_kes', 'gte')
        queryset = ListingListView._decimal_filter(queryset, params, 'max_price', 'price_kes', 'lte')
        queryset = ListingListView._int_filter(queryset, params, 'min_beds', 'beds', 'gte')
        queryset = ListingListView._int_filter(queryset, params, 'min_baths', 'baths', 'gte')
        return queryset

    @staticmethod
    def _decimal_filter(queryset, params, parameter, field, lookup):
        value = params.get(parameter)
        if not value:
            return queryset
        try:
            number = Decimal(value)
        except (InvalidOperation, TypeError, ValueError):
            return queryset.none()
        return queryset.filter(**{f'{field}__{lookup}': number})

    @staticmethod
    def _int_filter(queryset, params, parameter, field, lookup):
        value = params.get(parameter)
        if not value:
            return queryset
        try:
            number = int(value)
        except (TypeError, ValueError):
            return queryset.none()
        return queryset.filter(**{f'{field}__{lookup}': number})


class ListingDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, listing_id):
        if not getattr(request.user, 'email_verified', False):
            return Response({'error': 'Email verification is required.'}, status=status.HTTP_403_FORBIDDEN)

        try:
            listing = Listing.objects.get(pk=listing_id)
        except Listing.DoesNotExist:
            return Response({'error': 'Listing not found.'}, status=status.HTTP_404_NOT_FOUND)

        if not (
            is_admin(request.user)
            or str(listing.user_id) == str(request.user.pk)
            or (listing.approval_status == 'approved' and listing.is_published)
        ):
            return Response({'error': 'You are not authorized to view this listing.'}, status=status.HTTP_404_NOT_FOUND)

        return Response(ListingSerializer(listing).data)


class AdminListingReviewView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, listing_id):
        try:
            listing = review_listing(
                admin_user=request.user,
                listing_id=listing_id,
                decision=request.data.get('decision'),
                note=request.data.get('note', ''),
            )
        except PermissionError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except LookupError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_404_NOT_FOUND)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            'success': True,
            'listing': ListingSerializer(listing).data,
        })
