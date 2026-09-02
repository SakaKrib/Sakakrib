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
        caption = (listing.ai_caption or '').strip()
        if not caption:
            caption = (
                f"🏠 {listing.title or 'Property listing'}\n\n"
                f"📍 {listing.city or 'Location not specified'}, {listing.county or ''}\n"
                f"💰 KES {listing.price_kes or 0}{'/month' if listing.listing_type == 'rent' else ''}\n\n"
                f"{listing.description or ''}\n\n🔑 Verified listing on Saka Krib."
            )

        # The community post is the publication record for this listing. Keep the
        # listing attached and publish the exact AI caption when one exists. If a
        # prior post was created for the listing, refresh its content/caption so an
        # earlier fallback caption cannot replace the current AI-generated caption.
        CommunityPost.objects.update_or_create(
            listing_id=listing.id,
            defaults={
                'user_id': listing.user_id,
                'content': caption,
                'ai_caption': listing.ai_caption.strip() if listing.ai_caption else None,
                'post_type': 'listing',
            },
        )

        # Notification/email delivery must not be able to roll back an already
        # committed admin approval or community publication.
        transaction.on_commit(lambda: dispatch_user_notification(
            user_id=listing.user_id,
            notification_type='LISTING_APPROVED',
            title='Listing Approved - Saka Krib',
            message=f'Your property listing "{listing.title}" has been approved and is now live.',
            data={'listing_id': str(listing.id)},
            event_key=f'listing:approved:{listing.id}',
            send_email=True,
            email_template='listing_approved',
        ))

    return listing
