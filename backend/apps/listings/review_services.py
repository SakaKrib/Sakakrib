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
    if decision not in {'approved', 'rejected'}:
        raise ValueError('Decision must be approved or rejected.')

    note = str(note or '').strip()
    if len(note) > 5000:
        raise ValueError('Review note must be 5000 characters or fewer.')

    try:
        listing = Listing.objects.select_for_update().get(pk=listing_id)
    except Listing.DoesNotExist as exc:
        raise LookupError('Listing not found.') from exc

    was_approved = listing.approval_status == 'approved'
    listing.approval_status = decision
    # Approval controls publication; the legacy is_approved field is intentionally
    # left unchanged to match the production workflow contract.
    listing.is_published = decision == 'approved'
    listing.admin_reviewed_at = timezone.now()
    listing.admin_review_note = note
    listing.save(update_fields=[
        'approval_status',
        'is_published',
        'admin_reviewed_at',
        'admin_review_note',
        'updated_at',
    ])

    if decision == 'approved' and not was_approved:
        # The AI caption is generated and saved as part of listing creation.
        # Approval only publishes that existing caption; it must not generate a
        # second caption or replace the saved AI content with a fallback.
        caption = (listing.ai_caption or '').strip()
        if not caption:
            raise ValueError('Listing must have an AI caption before approval.')

        post = CommunityPost.objects.filter(listing_id=listing.id).order_by('created_at').first()
        post_defaults = {
            'user_id': listing.user_id,
            'content': caption,
            'ai_caption': caption,
            'post_type': 'listing',
        }
        if post:
            for field, value in post_defaults.items():
                setattr(post, field, value)
            if post.created_at is None:
                post.created_at = timezone.now()
            post.save(update_fields=['user_id', 'content', 'ai_caption', 'post_type', 'created_at'])
        else:
            CommunityPost.objects.create(
                listing_id=listing.id,
                created_at=timezone.now(),
                **post_defaults,
            )

        transaction.on_commit(lambda: dispatch_user_notification(
            user_id=listing.user_id,
            notification_type='LISTING_APPROVED',
            title='Listing Approved - Saka Krib',
            message=f'Your property listing "{listing.title}" has been approved and is now live.',
            data={
                'listing_id': str(listing.id),
                'listing_title': listing.title,
                'city': listing.city,
                'county': listing.county,
                'full_name': getattr(listing.user, 'full_name', '') if hasattr(listing, 'user') else '',
            },
            event_key=f'listing:approved:{listing.id}',
            send_email=True,
            email_template='listing_approved',
        ))

    return listing
