from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import ListingCreateSerializer, ListingSerializer
from .services import create_listing, create_listing_payment_intent, get_listing_entitlement


class ListingEntitlementView(APIView):
    def get(self, request):
        return Response(get_listing_entitlement(request.user.profile))


class ListingCreateView(APIView):
    def post(self, request):
        serializer = ListingCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = create_listing(request.user.profile, serializer.validated_data)
        if not result.get('listing_created'):
            return Response(result, status=402)
        return Response(result, status=201)


class ListingPaymentIntentView(APIView):
    def post(self, request):
        result = create_listing_payment_intent(request.user.profile, request.data)
        return Response(result, status=201)
