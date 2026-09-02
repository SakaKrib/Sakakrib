from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.accounts.models import Profile
from apps.core.domain_property import PropertyUnit
from apps.subscriptions.models import SubscriptionListing
from .models import Listing, ListingPaymentIntent
from .services import get_listing_entitlement

ROLES = {'landlord', 'real_estate'}


@transaction.atomic
def finalize_listing_draft(profile, draft_id, *, payment_intent_id=None):
    """Convert one owned DB draft into one active listing, preserving its ID."""
    owner = Profile.objects.select_for_update().get(pk=profile.id)
    role = str(getattr(owner, 'role', '') or '').strip().lower()
    if role not in ROLES:
        raise ValidationError('Only landlord and real-estate accounts can finalize listing drafts.')

    draft = Listing.objects.select_for_update().filter(pk=draft_id, user_id=owner.id, is_draft=True).first()
    if not draft:
        raise ValidationError('Draft not found.')

    entitlement = get_listing_entitlement(owner, lock_subscription=True)
    if not entitlement.get('can_start_listing'):
        raise ValidationError('Identity verification, KYC completion, and application approval are required before submitting a listing.')

    unit_count = 0
    if draft.is_property_management:
        unit_count = PropertyUnit.objects.filter(listing_id=draft.id, user_id=owner.id).count()
        if unit_count < 1:
            raise ValidationError('At least one property unit is required for a property management listing.')
        max_units = entitlement.get('max_units_per_listing')
        if max_units is not None and unit_count > int(max_units):
            raise ValidationError(f'Your PMS plan allows at most {int(max_units)} units for this listing.')
        if entitlement.get('subscription_status') != 'ACTIVE':
            raise ValidationError('An active PMS subscription is required for property management listings.')
        remaining = entitlement.get('subscription_listings_remaining')
        if remaining is not None and remaining <= 0:
            raise ValidationError('Your PMS subscription listing capacity has been reached.')
        source = 'SUBSCRIPTION'
        subscription_key = 'subscription_id' if role == 'landlord' else 'real_estate_subscription_id'
        subscription_id = entitlement.get('subscription_id')
        if not subscription_id:
            raise ValidationError('No active PMS subscription is available.')
    elif payment_intent_id:
        intent = ListingPaymentIntent.objects.select_for_update().filter(pk=payment_intent_id, user_id=owner.id, listing_id=draft.id, status='PAID').first()
        if not intent:
            raise ValidationError('A paid listing payment for this draft is required.')
        if intent.role != role:
            raise ValidationError('Payment role does not match the listing owner role.')
        source = 'INDIVIDUAL_PAID'
        subscription_key = subscription_id = None
    else:
        if not entitlement.get('can_create'):
            raise ValidationError('This draft requires an individual listing payment or an active subscription before submission.')
        source = entitlement.get('entitlement_source')
        if source == 'FREE':
            subscription_key = subscription_id = None
        elif source == 'SUBSCRIPTION':
            subscription_key = 'subscription_id' if role == 'landlord' else 'real_estate_subscription_id'
            subscription_id = entitlement.get('subscription_id')
        else:
            raise ValidationError('No valid listing entitlement is available.')

    draft.is_draft = False
    draft.is_paid = source == 'INDIVIDUAL_PAID'
    draft.is_published = False
    draft.approval_status = 'pending_review'
    draft.is_approved = False
    draft.status = 'pending'
    draft.updated_at = timezone.now()
    draft.save(update_fields=['is_draft', 'is_paid', 'is_published', 'approval_status', 'is_approved', 'status', 'updated_at'])

    if source == 'FREE':
        owner.free_listings_used = (owner.free_listings_used or 0) + 1
        owner.save(update_fields=['free_listings_used'])
    elif source == 'SUBSCRIPTION':
        SubscriptionListing.objects.create(**{subscription_key: subscription_id}, listing_id=draft.id, status='ACTIVE', activated_at=timezone.now(), created_at=timezone.now())

    return {
        'success': True,
        'listing_created': True,
        'listing_id': draft.id,
        'listing_entitlement': source,
        'payment_required': False,
        'is_published': False,
        'approval_status': 'pending_review',
        'property_unit_count': unit_count if draft.is_property_management else None,
    }
