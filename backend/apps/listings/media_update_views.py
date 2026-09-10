from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.domain_property import ListingMedia

from .serializers import ListingMediaSerializer


class ListingMediaUpdateView(APIView):
    """Allow a listing owner to update safe presentation fields on their media."""

    permission_classes = [IsAuthenticated]

    def patch(self, request, media_id):
        media = ListingMedia.objects.filter(pk=media_id).first()
        if not media:
            return Response({'detail': 'Media not found.'}, status=status.HTTP_404_NOT_FOUND)

        if str(media.user_id) != str(request.user.pk):
            return Response({'detail': 'You may only update your own listing media.'}, status=status.HTTP_403_FORBIDDEN)

        if 'label' in request.data:
            media.label = str(request.data.get('label') or '').strip()
        if 'position' in request.data:
            try:
                position = int(request.data.get('position'))
            except (TypeError, ValueError):
                return Response({'detail': 'position must be an integer.'}, status=status.HTTP_400_BAD_REQUEST)
            if position < 0:
                return Response({'detail': 'position must be zero or greater.'}, status=status.HTTP_400_BAD_REQUEST)
            media.position = position

        media.save(update_fields=['label', 'position'])
        return Response(ListingMediaSerializer(media, context={'request': request}).data)
