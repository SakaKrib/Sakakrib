from django.core.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .admin_listing_services import create_listing_on_behalf
from .serializers import ListingCreateSerializer, ListingSerializer


class AdminListingPostOnBehalfView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        owner_id = request.data.get('owner_id')
        if not owner_id:
            return Response({'error': 'owner_id is required.'}, status=400)

        serializer = ListingCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            listing = create_listing_on_behalf(request.user, owner_id, serializer.validated_data)
        except PermissionDenied as exc:
            return Response({'error': str(exc)}, status=403)
        except LookupError as exc:
            return Response({'error': str(exc)}, status=404)

        return Response({
            'success': True,
            'listing_created': True,
            'listing_id': str(listing.id),
            'owner_id': str(listing.user_id),
            'payment_required': False,
            'is_paid': False,
            'is_published': False,
            'approval_status': listing.approval_status,
            'listing': ListingSerializer(listing, context={'request': request}).data,
        }, status=201)
