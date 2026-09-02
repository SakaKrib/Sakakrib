from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.authorization import is_admin

from .ai_caption_services import generate_listing_caption


class ListingAiCaptionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, listing_id):
        try:
            listing, caption = generate_listing_caption(request.user, listing_id)
        except LookupError as exc:
            return Response({'detail': str(exc)}, status=404)
        except PermissionError as exc:
            return Response({'detail': str(exc)}, status=403)
        return Response({
            'listing_id': str(listing.id),
            'caption': caption,
            'ai_caption_generated_at': listing.ai_caption_generated_at,
            'is_admin': is_admin(request.user),
        }, status=200)
