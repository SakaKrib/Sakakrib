from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .draft_finalization import finalize_listing_draft
from .draft_services import delete_listing_draft, get_listing_draft, list_listing_drafts, save_listing_draft


def _draft_payload(draft):
    return {
        'id': str(draft.id),
        'listing_id': str(draft.id),
        'user_id': str(draft.user_id),
        'data': {
            'title': draft.title,
            'description': draft.description,
            'city': draft.city,
            'county': draft.county,
            'location_search': draft.location_search,
            'latitude': draft.latitude,
            'longitude': draft.longitude,
            'property_name': draft.property_name,
            'property_type': draft.property_type,
            'price_kes': float(draft.price_kes) if draft.price_kes is not None else None,
            'listing_type': draft.listing_type,
            'deposit_required': draft.deposit_required,
            'deposit_structure': draft.deposit_structure,
            'deposit_amount': float(draft.deposit_amount) if draft.deposit_amount is not None else 0,
            'size': draft.size,
            'beds': draft.beds,
            'baths': draft.baths,
            'contact_phone': draft.contact_phone,
            'contact_email': draft.contact_email,
            'social_links': draft.social_links,
            'booking_enabled': draft.booking_enabled,
            'payment_enabled': draft.payment_enabled,
            'is_property_management': draft.is_property_management,
        },
        'created_at': draft.created_at,
        'updated_at': draft.updated_at,
    }


class ListingDraftListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({'drafts': [_draft_payload(draft) for draft in list_listing_drafts(request.user)]})

    def post(self, request):
        draft = save_listing_draft(request.user, request.data.get('data', request.data), request.data.get('draft_id'))
        return Response({'success': True, **_draft_payload(draft)}, status=status.HTTP_200_OK)


class ListingDraftDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, draft_id):
        draft = get_listing_draft(request.user, draft_id)
        if not draft:
            return Response({'detail': 'Draft not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(_draft_payload(draft))

    def patch(self, request, draft_id):
        draft = save_listing_draft(request.user, request.data.get('data', request.data), draft_id)
        return Response({'success': True, **_draft_payload(draft)})

    def post(self, request, draft_id):
        try:
            result = finalize_listing_draft(
                request.user,
                draft_id,
                payment_intent_id=request.data.get('payment_intent_id'),
            )
        except Exception as exc:
            detail = getattr(exc, 'detail', str(exc))
            if isinstance(detail, (list, dict)):
                detail = str(detail)
            return Response({'success': False, 'detail': detail}, status=status.HTTP_400_BAD_REQUEST)
        return Response(result, status=status.HTTP_201_CREATED)

    def delete(self, request, draft_id):
        delete_listing_draft(request.user, draft_id)
        return Response(status=status.HTTP_204_NO_CONTENT)
