from django.db import transaction
from django.utils import timezone

from apps.accounts.authorization import require_admin
from apps.core.domain_property import CommunityPost
from apps.core.notification_services import dispatch_user_notification
from .models import Listing


@transaction.atomic
def review_listing(admin_user, listing_id, decision, note=''):
    require_admin(admin_user)
    decision = str(decision or '').strip().lower()
    if decision not in {'approved', 'rejected'}: raise ValueError('Decision must be approved or rejected.')
    note = str(note or '').strip()
    if len(note) > 5000: raise ValueError('Review note must be 5000 characters or fewer.')
    try: listing = Listing.objects.select_for_update().get(pk=listing_id)
    except Listing.DoesNotExist as exc: raise LookupError('Listing not found.') from exc

    was_approved = listing.approval_status == 'approved'
    is_approved = decision == 'approved'
    listing.approval_status = decision
    listing.is_approved = is_approved
    listing.status = decision
    listing.is_published = is_approved
    listing.admin_reviewed_at = timezone.now()
    listing.admin_review_note = note
    listing.save(update_fields=[
        'approval_status', 'is_approved', 'status', 'is_published',
        'admin_reviewed_at', 'admin_review_note', 'updated_at',
    ])

    if decision == 'approved' and not was_approved:
        caption = (listing.ai_caption or '').strip()
        if not caption: raise ValueError('Listing must have an AI caption before approval.')
        post = CommunityPost.objects.filter(listing_id=listing.id).order_by('created_at').first()
        if not post:
            post = CommunityPost.objects.filter(
                listing_id__isnull=True,
                user_id=listing.user_id,
                content='',
                ai_caption__isnull=True,
                post_type='listing',
                created_at__isnull=True,
            ).order_by('id').first()
            if post: post.listing_id = listing.id
        values = {'user_id': listing.user_id, 'content': caption, 'ai_caption': caption, 'post_type': 'listing', 'created_at': post.created_at if post else timezone.now()}
        if post:
            if post.created_at is None: values['created_at'] = timezone.now()
            for field, value in values.items(): setattr(post, field, value)
            post.save(update_fields=['listing_id','user_id','content','ai_caption','post_type','created_at'])
        else:
            CommunityPost.objects.create(listing_id=listing.id, **values)

        transaction.on_commit(lambda: dispatch_user_notification(
            user_id=listing.user_id, notification_type='LISTING_APPROVED', title='Listing Approved - Saka Krib',
            message=f'Your property listing "{listing.title}" has been approved and is now live.',
            data={'listing_id': str(listing.id), 'listing_title': listing.title, 'city': listing.city, 'county': listing.county, 'full_name': getattr(listing.user, 'full_name', '') if hasattr(listing, 'user') else ''},
            event_key=f'listing:approved:{listing.id}', send_email=True, email_template='listing_approved',
        ))
    return listing
