from django.core.exceptions import ValidationError
from django.core.files.storage import default_storage
from django.http import FileResponse
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .community_media_services import (
    ALLOWED_COMMUNITY_IMAGE_TYPES,
    MAX_COMMUNITY_IMAGES,
    community_media_url,
    store_community_image,
)
from .domain_property import CommunityPost, CommunityPostMedia


class CommunityPostMediaView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, post_id):
        post = CommunityPost.objects.filter(pk=post_id, user_id=request.user.id).first()
        if not post:
            return Response({'detail': 'Post not found.'}, status=status.HTTP_404_NOT_FOUND)

        existing = CommunityPostMedia.objects.filter(post_id=post.id).order_by('position')
        if existing.count() >= MAX_COMMUNITY_IMAGES:
            return Response({'detail': 'A community post can have at most 4 images.'}, status=status.HTTP_400_BAD_REQUEST)

        file = request.FILES.get('file')
        try:
            position = existing.count()
            stored = store_community_image(
                user_id=request.user.id,
                post_id=post.id,
                file=file,
                position=position,
            )
            media = CommunityPostMedia.objects.create(
                post_id=post.id,
                user_id=request.user.id,
                storage_path=stored['storage_path'],
                url=community_media_url('PLACEHOLDER'),
                label=stored['name'],
                media_type='photo',
                position=position,
            )
            media.url = community_media_url(media.id)
            media.save(update_fields=['url'])
            return Response({'media': {
                'id': str(media.id),
                'post_id': str(media.post_id),
                'user_id': str(media.user_id),
                'url': media.url,
                'label': media.label,
                'media_type': media.media_type,
                'position': media.position,
                'created_at': media.created_at,
            }}, status=status.HTTP_201_CREATED)
        except ValidationError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, post_id, media_id):
        media = CommunityPostMedia.objects.filter(
            id=media_id,
            post_id=post_id,
            user_id=request.user.id,
        ).first()
        if not media:
            return Response({'detail': 'Media not found.'}, status=status.HTTP_404_NOT_FOUND)
        if media.storage_path and default_storage.exists(media.storage_path):
            default_storage.delete(media.storage_path)
        media.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class CommunityPostMediaFileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, media_id):
        media = CommunityPostMedia.objects.filter(id=media_id).first()
        if not media or not CommunityPost.objects.filter(id=media.post_id).exists():
            return Response({'detail': 'Media not found.'}, status=status.HTTP_404_NOT_FOUND)
        if not default_storage.exists(media.storage_path):
            return Response({'detail': 'Media file not found.'}, status=status.HTTP_404_NOT_FOUND)
        file_obj = default_storage.open(media.storage_path, 'rb')
        content_type = ALLOWED_COMMUNITY_IMAGE_TYPES.keys()
        extension = media.storage_path.rsplit('.', 1)[-1].lower() if '.' in media.storage_path else ''
        mime = {'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'webp': 'image/webp', 'gif': 'image/gif'}.get(extension, 'application/octet-stream')
        response = FileResponse(file_obj, content_type=mime)
        response['Content-Disposition'] = 'inline'
        response['Cache-Control'] = 'private, max-age=300'
        return response
