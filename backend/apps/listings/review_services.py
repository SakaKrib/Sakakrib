from django.core.exceptions import PermissionDenied
from django.db import transaction
from django.utils import timezone

from apps.accounts.authorization import require_admin

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

    listing.approval_status = decision
    # This mirrors the production admin_review_listing function: approval controls
    # publication, while the legacy is_approved flag is not mutated by review.
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
    return listing
