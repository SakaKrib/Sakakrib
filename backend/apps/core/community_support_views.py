from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.authorization import is_admin
from apps.accounts.models import Profile
from apps.listings.models import Listing

from .domain_platform import SupportTicket, TermsAcceptance
from .domain_property import CommunityPost, ListingMedia, Review


def _serialize(instance):
    return {field.name: getattr(instance, field.name) for field in instance._meta.fields}


def _serialize_community_post(request, post):
    row = _serialize(post)
    profile = Profile.objects.filter(pk=post.user_id).first()
    row['author'] = {
        'id': str(profile.id),
        'full_name': profile.full_name or '',
        'role': profile.role,
        'verification_status': profile.verification_status,
    } if profile else None

    row['listing'] = None
    row['media'] = []
    if post.listing_id:
        listing = Listing.objects.filter(pk=post.listing_id).first()
        if listing:
            row['listing'] = _serialize(listing)
            media_rows = ListingMedia.objects.filter(
                listing_id=listing.id,
                media_type='photo',
            ).order_by('position', 'created_at')
            for media in media_rows:
                value = media.url or ''
                if value.startswith('django-media://'):
                    value = request.build_absolute_uri(f'/api/listings/media/{media.id}/')
                row['media'].append({
                    'id': str(media.id),
                    'listing_id': str(media.listing_id),
                    'url': value,
                    'label': media.label,
                    'media_type': media.media_type,
                    'position': media.position,
                    'unit_id': str(media.unit_id) if media.unit_id else None,
                })
    return row


class CommunityPostView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, object_id=None):
        qs = CommunityPost.objects.all().order_by('-created_at')
        if object_id:
            post = qs.filter(id=object_id).first()
            if not post:
                return Response({'detail': 'Post not found.'}, status=status.HTTP_404_NOT_FOUND)
            if post.listing_id:
                visible = Listing.objects.filter(
                    id=post.listing_id,
                    approval_status='approved',
                    is_published=True,
                ).exists()
                if not visible and str(post.user_id) != str(request.user.id):
                    return Response({'detail': 'Post not found.'}, status=status.HTTP_404_NOT_FOUND)
            return Response({'post': _serialize_community_post(request, post)})

        rows = []
        for post in qs[:100]:
            if post.listing_id and not Listing.objects.filter(
                id=post.listing_id, approval_status='approved', is_published=True
            ).exists():
                if str(post.user_id) != str(request.user.id):
                    continue
            rows.append(_serialize_community_post(request, post))
        return Response({'items': rows})

    def post(self, request):
        listing_id = request.data.get('listing_id')
        if listing_id:
            if not Listing.objects.filter(
                id=listing_id, user_id=request.user.id, approval_status='approved', is_published=True
            ).exists():
                return Response({'detail': 'You may only attach an approved published listing you own.'}, status=status.HTTP_400_BAD_REQUEST)

        content = str(request.data.get('content') or '')
        if not content.strip():
            return Response({'detail': 'Content is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if len(content) > 10000:
            return Response({'detail': 'Content is too long.'}, status=status.HTTP_400_BAD_REQUEST)

        post = CommunityPost.objects.create(
            user_id=request.user.id,
            listing_id=listing_id or None,
            content=content,
            ai_caption=request.data.get('ai_caption') or None,
            post_type=request.data.get('post_type') or 'manual',
        )
        return Response({'post': _serialize_community_post(request, post)}, status=status.HTTP_201_CREATED)

    def patch(self, request, object_id):
        post = CommunityPost.objects.filter(id=object_id, user_id=request.user.id).first()
        if not post:
            return Response({'detail': 'Post not found.'}, status=status.HTTP_404_NOT_FOUND)
        if 'content' in request.data:
            content = str(request.data.get('content') or '')
            if not content.strip() or len(content) > 10000:
                return Response({'detail': 'Content must be between 1 and 10000 characters.'}, status=status.HTTP_400_BAD_REQUEST)
            post.content = content
        if 'ai_caption' in request.data:
            post.ai_caption = request.data.get('ai_caption')
        if 'post_type' in request.data:
            post.post_type = str(request.data.get('post_type') or 'listing')
        post.save(update_fields=['content', 'ai_caption', 'post_type'])
        return Response({'post': _serialize_community_post(request, post)})

    def delete(self, request, object_id):
        deleted, _ = CommunityPost.objects.filter(id=object_id, user_id=request.user.id).delete()
        if not deleted:
            return Response({'detail': 'Post not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ReviewView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, object_id=None):
        qs = Review.objects.all().order_by('-created_at')
        if request.query_params.get('mover_id'):
            qs = qs.filter(mover_id=request.query_params['mover_id'])
        if request.query_params.get('reviewee_id'):
            qs = qs.filter(reviewee_id=request.query_params['reviewee_id'])
        if request.query_params.get('listing_id'):
            qs = qs.filter(listing_id=request.query_params['listing_id'])
        if object_id:
            review = qs.filter(id=object_id).first()
            if not review:
                return Response({'detail': 'Review not found.'}, status=status.HTTP_404_NOT_FOUND)
            return Response({'review': _serialize(review)})
        return Response({'items': [_serialize(row) for row in qs[:100]]})

    def post(self, request):
        rating = request.data.get('rating', 5)
        try:
            rating = int(rating)
        except (TypeError, ValueError):
            return Response({'detail': 'Rating must be an integer.'}, status=status.HTTP_400_BAD_REQUEST)
        if not 1 <= rating <= 5:
            return Response({'detail': 'Rating must be between 1 and 5.'}, status=status.HTTP_400_BAD_REQUEST)

        booking_id = request.data.get('booking_id')
        kwargs = {
            'reviewer_id': request.user.id,
            'reviewee_id': request.data.get('reviewee_id') or None,
            'listing_id': request.data.get('listing_id') or None,
            'mover_id': request.data.get('mover_id') or None,
            'rating': rating,
            'comment': str(request.data.get('comment') or ''),
            'review_type': str(request.data.get('review_type') or ''),
            'booking_id': booking_id or None,
        }
        if not kwargs['review_type']:
            return Response({'detail': 'review_type is required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            review = Review.objects.create(**kwargs)
        except IntegrityError:
            return Response({'detail': 'A review already exists for this booking.'}, status=status.HTTP_409_CONFLICT)
        return Response({'review': _serialize(review)}, status=status.HTTP_201_CREATED)

    def patch(self, request, object_id):
        review = Review.objects.filter(id=object_id, reviewer_id=request.user.id).first()
        if not review:
            return Response({'detail': 'Review not found.'}, status=status.HTTP_404_NOT_FOUND)
        for field in ('comment', 'review_type'):
            if field in request.data:
                setattr(review, field, str(request.data.get(field) or ''))
        if 'rating' in request.data:
            try:
                rating = int(request.data['rating'])
            except (TypeError, ValueError):
                return Response({'detail': 'Rating must be an integer.'}, status=status.HTTP_400_BAD_REQUEST)
            if not 1 <= rating <= 5:
                return Response({'detail': 'Rating must be between 1 and 5.'}, status=status.HTTP_400_BAD_REQUEST)
            review.rating = rating
        review.save(update_fields=['comment', 'review_type', 'rating'])
        return Response({'review': _serialize(review)})

    def delete(self, request, object_id):
        deleted, _ = Review.objects.filter(id=object_id, reviewer_id=request.user.id).delete()
        if not deleted:
            return Response({'detail': 'Review not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


class SupportTicketView(APIView):
    def get_permissions(self):
        if self.request.method == 'POST':
            return [AllowAny()]
        return [IsAuthenticated()]

    def get(self, request, object_id=None):
        qs = SupportTicket.objects.all().order_by('-created_at')
        if not is_admin(request.user):
            qs = qs.filter(user_id=request.user.id)
        if object_id:
            ticket = qs.filter(id=object_id).first()
            if not ticket:
                return Response({'detail': 'Support ticket not found.'}, status=status.HTTP_404_NOT_FOUND)
            return Response({'ticket': _serialize(ticket)})
        return Response({'items': [_serialize(row) for row in qs[:100]]})

    def post(self, request):
        user = request.user if getattr(request.user, 'is_authenticated', False) else None
        full_name = str(request.data.get('full_name') or '').strip()
        email = str(request.data.get('email') or '').strip()
        subject = str(request.data.get('subject') or '').strip()
        message = str(request.data.get('message') or '').strip()
        if not full_name or not email or not subject or not message:
            return Response({'detail': 'full_name, email, subject and message are required.'}, status=status.HTTP_400_BAD_REQUEST)
        ticket = SupportTicket.objects.create(
            user_id=user.id if user else None,
            full_name=full_name,
            email=email,
            phone=str(request.data.get('phone') or ''),
            subject=subject,
            message=message,
        )
        return Response({'ticket': _serialize(ticket)}, status=status.HTTP_201_CREATED)

    def patch(self, request, object_id):
        if not is_admin(request.user):
            return Response({'detail': 'Administrator access is required.'}, status=status.HTTP_403_FORBIDDEN)
        ticket = SupportTicket.objects.filter(id=object_id).first()
        if not ticket:
            return Response({'detail': 'Support ticket not found.'}, status=status.HTTP_404_NOT_FOUND)
        if 'status' in request.data:
            ticket.status = str(request.data['status'])
        if 'admin_reply' in request.data:
            ticket.admin_reply = str(request.data['admin_reply'] or '')
        if ticket.status in {'resolved', 'closed'} and not ticket.resolved_at:
            ticket.resolved_at = timezone.now()
            ticket.resolved_by = request.user.id
        ticket.save(update_fields=['status', 'admin_reply', 'resolved_at', 'resolved_by', 'updated_at'])
        return Response({'ticket': _serialize(ticket)})

    def delete(self, request, object_id):
        if not is_admin(request.user):
            return Response({'detail': 'Administrator access is required.'}, status=status.HTTP_403_FORBIDDEN)
        deleted, _ = SupportTicket.objects.filter(id=object_id).delete()
        if not deleted:
            return Response({'detail': 'Support ticket not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


class TermsAcceptanceView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, object_id=None):
        qs = TermsAcceptance.objects.filter(user_id=request.user.id).order_by('-created_at')
        if request.query_params.get('context'):
            qs = qs.filter(context=request.query_params['context'])
        if object_id:
            item = qs.filter(id=object_id).first()
            if not item:
                return Response({'detail': 'Terms acceptance not found.'}, status=status.HTTP_404_NOT_FOUND)
            return Response({'terms': _serialize(item)})
        return Response({'items': [_serialize(row) for row in qs[:100]]})

    def post(self, request):
        context = str(request.data.get('context') or '').strip()
        accepted = bool(request.data.get('accepted', False))
        if not context:
            return Response({'detail': 'context is required.'}, status=status.HTTP_400_BAD_REQUEST)
        item = TermsAcceptance.objects.create(
            user_id=request.user.id,
            context=context,
            accepted=accepted,
            accepted_at=timezone.now() if accepted else None,
        )
        return Response({'terms': _serialize(item)}, status=status.HTTP_201_CREATED)

    def patch(self, request, object_id):
        item = TermsAcceptance.objects.filter(id=object_id, user_id=request.user.id).first()
        if not item:
            return Response({'detail': 'Terms acceptance not found.'}, status=status.HTTP_404_NOT_FOUND)
        if 'accepted' in request.data:
            item.accepted = bool(request.data['accepted'])
            item.accepted_at = timezone.now() if item.accepted else None
        if 'context' in request.data:
            context = str(request.data.get('context') or '').strip()
            if not context:
                return Response({'detail': 'context is required.'}, status=status.HTTP_400_BAD_REQUEST)
            item.context = context
        item.save(update_fields=['accepted', 'accepted_at', 'context'])
        return Response({'terms': _serialize(item)})
