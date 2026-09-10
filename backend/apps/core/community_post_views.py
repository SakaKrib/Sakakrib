from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .community_support_views import CommunityPostView as BaseCommunityPostView
from .domain_property import CommunityPost, CommunityPostMedia, CommunityPostReaction

ALLOWED_COMMUNITY_ROLES = {'renter', 'landlord', 'mover', 'real_estate'}
ALLOWED_REACTIONS = {'like', 'love', 'helpful', 'celebrate'}


def _role_allowed(user):
    return str(getattr(user, 'role', '') or '').strip().lower() in ALLOWED_COMMUNITY_ROLES


def _augment_post(row, user_id):
    post_id = row.get('id')
    reactions = CommunityPostReaction.objects.filter(post_id=post_id)
    row['reaction_count'] = reactions.count()
    mine = reactions.filter(user_id=user_id).first()
    row['user_reaction'] = mine.reaction_type if mine else None
    media_rows = CommunityPostMedia.objects.filter(post_id=post_id).order_by('position', 'created_at')
    row['community_media'] = [{
        'id': str(media.id),
        'post_id': str(media.post_id),
        'user_id': str(media.user_id),
        'url': media.url,
        'label': media.label,
        'media_type': media.media_type,
        'position': media.position,
        'created_at': media.created_at,
    } for media in media_rows]
    return row


class CommunityPostV2View(BaseCommunityPostView):
    def get(self, request, object_id=None):
        response = super().get(request, object_id=object_id)
        if not response.data:
            return response
        if object_id and response.status_code == status.HTTP_200_OK:
            if response.data.get('post'):
                response.data['post'] = _augment_post(response.data['post'], request.user.id)
            return response
        if response.status_code == status.HTTP_200_OK:
            response.data['items'] = [
                _augment_post(row, request.user.id) for row in response.data.get('items', [])
            ]
        return response

    def post(self, request):
        if not _role_allowed(request.user):
            return Response(
                {'detail': 'Only renter, landlord, mover, and real_estate accounts can create community posts.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        response = super().post(request)
        if response.status_code == status.HTTP_201_CREATED:
            post_id = response.data.get('post', {}).get('id')
            post = CommunityPost.objects.filter(pk=post_id).first()
            if post and post.created_at is None:
                from django.utils import timezone
                post.created_at = timezone.now()
                post.save(update_fields=['created_at'])
            if post:
                response.data['post'] = _augment_post(response.data['post'], request.user.id)
        return response


class CommunityPostReactionView(APIView):
    permission_classes = [__import__('rest_framework.permissions', fromlist=['IsAuthenticated']).IsAuthenticated]

    def post(self, request, post_id):
        post = CommunityPost.objects.filter(pk=post_id).first()
        if not post:
            return Response({'detail': 'Post not found.'}, status=status.HTTP_404_NOT_FOUND)
        if str(post.user_id) == str(request.user.id):
            return Response({'detail': 'You cannot react to your own post.'}, status=status.HTTP_400_BAD_REQUEST)
        reaction_type = str(request.data.get('reaction_type') or 'like').strip().lower()
        if reaction_type not in ALLOWED_REACTIONS:
            return Response({'detail': 'Invalid reaction type.'}, status=status.HTTP_400_BAD_REQUEST)
        reaction = CommunityPostReaction.objects.filter(post_id=post.id, user_id=request.user.id).first()
        if reaction and reaction.reaction_type == reaction_type:
            reaction.delete()
            reacted = False
            user_reaction = None
        elif reaction:
            reaction.reaction_type = reaction_type
            reaction.save(update_fields=['reaction_type', 'updated_at'])
            reacted = True
            user_reaction = reaction.reaction_type
        else:
            CommunityPostReaction.objects.create(
                post_id=post.id,
                user_id=request.user.id,
                reaction_type=reaction_type,
            )
            reacted = True
            user_reaction = reaction_type
        return Response({
            'reacted': reacted,
            'reaction_type': user_reaction,
            'reaction_count': CommunityPostReaction.objects.filter(post_id=post.id).count(),
        })

    def delete(self, request, post_id):
        deleted, _ = CommunityPostReaction.objects.filter(
            post_id=post_id,
            user_id=request.user.id,
        ).delete()
        if not deleted:
            return Response({'detail': 'Reaction not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response({
            'reacted': False,
            'reaction_type': None,
            'reaction_count': CommunityPostReaction.objects.filter(post_id=post_id).count(),
        })
