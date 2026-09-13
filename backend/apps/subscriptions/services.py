from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.listings.models import Listing
from .constants import FREE_LISTING_LIMIT, INDIVIDUAL_LISTING_PRICE_KES
from .models import (
    LandlordSubscription,
    RealEstatePMSMember,
    RealEstatePMSListingAssignment,
    RealEstateSubscription,
    SubscriptionListing,
    SubscriptionPlan,
)


def get_current_subscription(profile):
    now = timezone.now()
    if profile.role == 'landlord':
        return LandlordSubscription.objects.filter(landlord_id=profile.id).filter(Q(status='ACTIVE', current_period_end__gt=now) | Q(status='GRACE_PERIOD', grace_period_end__gt=now)).order_by('-created_at').first()
    if profile.role == 'real_estate':
        return RealEstateSubscription.objects.filter(real_estate_id=profile.id).filter(Q(status='ACTIVE', current_period_end__gt=now) | Q(status='GRACE_PERIOD', grace_period_end__gt=now)).order_by('-created_at').first()
    return None


def get_subscription_plan(subscription):
    return SubscriptionPlan.objects.filter(pk=subscription.plan_id).first() if subscription else None


def get_real_estate_pms_membership(profile):
    if not profile:
        return None
    return RealEstatePMSMember.objects.filter(user_id=profile.id, status=RealEstatePMSMember.STATUS_ACTIVE).first()


def get_real_estate_pms_context(profile):
    if not profile or not profile.is_authenticated:
        return None
    if profile.role == 'real_estate':
        subscription = get_current_subscription(profile)
        if not subscription:
            return None
        return {'owner_id': profile.id, 'subscription': subscription, 'pms_role': 'ADMIN', 'membership': None}
    membership = get_real_estate_pms_membership(profile)
    if not membership:
        return None
    subscription = RealEstateSubscription.objects.filter(real_estate_id=membership.real_estate_id).filter(
        Q(status='ACTIVE', current_period_end__gt=timezone.now()) | Q(status='GRACE_PERIOD', grace_period_end__gt=timezone.now())
    ).order_by('-created_at').first()
    if not subscription:
        return None
    return {'owner_id': membership.real_estate_id, 'subscription': subscription, 'pms_role': membership.role, 'membership': membership}


def get_subscription_listing_usage(profile, subscription):
    if not subscription:
        return 0
    owned = Listing.objects.filter(user_id=profile.id).values('id')
    key = 'subscription_id' if profile.role == 'landlord' else 'real_estate_subscription_id'
    return SubscriptionListing.objects.filter(**{key: subscription.id}, status='ACTIVE', listing_id__in=owned).count()


def get_subscription_access(profile):
    from apps.listings.services import get_listing_entitlement
    entitlement = get_listing_entitlement(profile)
    return {**entitlement, 'free_limit': entitlement.get('free_limit', FREE_LISTING_LIMIT), 'individual_listing_price_kes': entitlement.get('individual_listing_price_kes', INDIVIDUAL_LISTING_PRICE_KES)}


def get_pms_access(profile):
    if not profile or not profile.is_authenticated:
        return {'allowed': False, 'reason': 'AUTHENTICATION_REQUIRED', 'read_only': False}
    membership = get_real_estate_pms_membership(profile)
    is_real_estate_owner = profile.role == 'real_estate'
    if profile.role not in {'landlord', 'real_estate'} and not membership:
        return {'allowed': False, 'reason': 'PMS_ROLE_REQUIRED', 'read_only': False}
    if str(getattr(profile, 'verification_status', '')).lower() != 'verified' or not getattr(profile, 'kyc_completed', False):
        return {'allowed': False, 'reason': 'IDENTITY_VERIFICATION_REQUIRED', 'read_only': False}
    if not getattr(profile, 'email_verified', False):
        return {'allowed': False, 'reason': 'EMAIL_VERIFICATION_REQUIRED', 'read_only': False}
    if membership and not is_real_estate_owner:
        subscription = RealEstateSubscription.objects.filter(real_estate_id=membership.real_estate_id).filter(
            Q(status='ACTIVE', current_period_end__gt=timezone.now()) | Q(status='GRACE_PERIOD', grace_period_end__gt=timezone.now())
        ).order_by('-created_at').first()
        if not subscription:
            return {'allowed': False, 'reason': 'ACTIVE_SUBSCRIPTION_REQUIRED', 'read_only': False, 'role': 'real_estate_agent'}
        read_only = subscription.status == 'GRACE_PERIOD'
        return {'allowed': True, 'reason': 'SUBSCRIPTION_ACTIVE' if not read_only else 'SUBSCRIPTION_GRACE_PERIOD', 'read_only': read_only, 'role': 'real_estate_agent', 'pms_role': membership.role, 'subscription_id': str(subscription.id), 'subscription_status': subscription.status, 'pms_owner_id': str(membership.real_estate_id)}
    if profile.role not in {'landlord', 'real_estate'}:
        return {'allowed': False, 'reason': 'PMS_ROLE_REQUIRED', 'read_only': False}
    application_field = 'landlord_application_status' if profile.role == 'landlord' else 'real_estate_application_status'
    if getattr(profile, application_field, None) != 'approved':
        return {'allowed': False, 'reason': 'LANDLORD_APPLICATION_NOT_APPROVED' if profile.role == 'landlord' else 'REAL_ESTATE_APPLICATION_NOT_APPROVED', 'read_only': False}
    subscription = get_current_subscription(profile)
    if not subscription:
        return {'allowed': False, 'reason': 'ACTIVE_SUBSCRIPTION_REQUIRED', 'read_only': False, 'role': profile.role}
    read_only = subscription.status == 'GRACE_PERIOD'
    return {'allowed': True, 'reason': 'SUBSCRIPTION_ACTIVE' if not read_only else 'SUBSCRIPTION_GRACE_PERIOD', 'read_only': read_only, 'role': profile.role, 'pms_role': 'ADMIN' if profile.role == 'real_estate' else None, 'subscription_id': str(subscription.id), 'subscription_status': subscription.status, 'pms_owner_id': str(profile.id) if profile.role == 'real_estate' else None}


def get_real_estate_team(profile):
    context = get_real_estate_pms_context(profile)
    if not context:
        raise ValueError('Real Estate PMS access denied.')
    from apps.accounts.models import Profile
    members = RealEstatePMSMember.objects.filter(real_estate_id=context['owner_id']).order_by('created_at')
    profiles = {str(row.id): row for row in Profile.objects.filter(id__in=members.values_list('user_id', flat=True))}
    return {
        'pms_owner_id': str(context['owner_id']),
        'pms_role': context['pms_role'],
        'members': [
            {
                'id': str(member.id),
                'user_id': str(member.user_id),
                'email': profiles.get(str(member.user_id)).email if profiles.get(str(member.user_id)) else None,
                'full_name': profiles.get(str(member.user_id)).full_name if profiles.get(str(member.user_id)) else None,
                'role': member.role,
                'status': member.status,
                'created_at': member.created_at,
                'updated_at': member.updated_at,
            }
            for member in members
        ],
    }


def _require_real_estate_admin(profile):
    context = get_real_estate_pms_context(profile)
    if not context or context['pms_role'] != 'ADMIN':
        raise ValueError('Only the Real Estate PMS administrator can manage the agent team.')
    if context['subscription'].status == 'GRACE_PERIOD':
        raise ValueError('PMS is read-only during the grace period.')
    return context


def add_real_estate_team_member(profile, user_id=None, role='AGENT', email=None):
    context = _require_real_estate_admin(profile)
    role = str(role or 'AGENT').upper()
    valid_roles = {choice[0] for choice in RealEstatePMSMember.ROLE_CHOICES}
    if role not in valid_roles:
        raise ValueError('Invalid Real Estate PMS team role.')
    if not user_id and not email:
        raise ValueError('An agent user_id or email is required.')
    if user_id and str(user_id) == str(profile.id):
        raise ValueError('The PMS administrator is already the administrator of this PMS.')
    from apps.accounts.models import Profile
    target = Profile.objects.filter(pk=user_id, is_active=True).first() if user_id else Profile.objects.filter(email__iexact=str(email).strip(), is_active=True).first()
    if not target:
        raise ValueError('Agent account not found.')
    if target.id == profile.id:
        raise ValueError('The PMS administrator is already the administrator of this PMS.')
    now = timezone.now()
    existing = RealEstatePMSMember.objects.filter(real_estate_id=context['owner_id'], user_id=target.id).first()
    if existing:
        existing.role = role
        existing.status = RealEstatePMSMember.STATUS_ACTIVE
        existing.updated_at = now
        existing.save(update_fields=['role', 'status', 'updated_at'])
        member = existing
        created = False
    else:
        member = RealEstatePMSMember.objects.create(real_estate_id=context['owner_id'], user_id=target.id, role=role, status=RealEstatePMSMember.STATUS_ACTIVE, created_at=now, updated_at=now)
        created = True
    return {'id': str(member.id), 'user_id': str(member.user_id), 'email': target.email, 'full_name': target.full_name, 'role': member.role, 'status': member.status, 'created_at': member.created_at, 'updated_at': member.updated_at, 'created': created}


def remove_real_estate_team_member(profile, user_id):
    context = _require_real_estate_admin(profile)
    member = RealEstatePMSMember.objects.filter(real_estate_id=context['owner_id'], user_id=user_id).first()
    if not member:
        raise ValueError('Agent is not a member of this PMS team.')
    member.status = RealEstatePMSMember.STATUS_SUSPENDED
    member.updated_at = timezone.now()
    member.save(update_fields=['status', 'updated_at'])
    RealEstatePMSListingAssignment.objects.filter(real_estate_id=context['owner_id'], agent_id=user_id, is_active=True).update(is_active=False, updated_at=timezone.now())
    return {'success': True, 'user_id': str(user_id), 'status': member.status}


def update_real_estate_team_member(profile, user_id, role):
    context = _require_real_estate_admin(profile)
    role = str(role or '').upper()
    valid_roles = {choice[0] for choice in RealEstatePMSMember.ROLE_CHOICES}
    if role not in valid_roles:
        raise ValueError('Invalid Real Estate PMS team role.')
    member = RealEstatePMSMember.objects.filter(real_estate_id=context['owner_id'], user_id=user_id).first()
    if not member:
        raise ValueError('Agent is not a member of this PMS team.')
    member.role = role
    member.status = RealEstatePMSMember.STATUS_ACTIVE
    member.updated_at = timezone.now()
    member.save(update_fields=['role', 'status', 'updated_at'])
    return {'success': True, 'user_id': str(user_id), 'role': member.role, 'status': member.status}


def assign_real_estate_listing(profile, listing_id, agent_id):
    context = _require_real_estate_admin(profile)
    owner_id = context['owner_id']
    if not RealEstatePMSMember.objects.filter(real_estate_id=owner_id, user_id=agent_id, status=RealEstatePMSMember.STATUS_ACTIVE).exists():
        raise ValueError('Agent is not an active member of this PMS team.')
    if not SubscriptionListing.objects.filter(real_estate_subscription_id=context['subscription'].id, listing_id=listing_id, status='ACTIVE').exists():
        raise ValueError('Listing is not currently managed by this PMS subscription.')
    if not Listing.objects.filter(pk=listing_id, user_id=owner_id).exists():
        raise ValueError('Listing not found in this PMS.')
    now = timezone.now()
    assignment, created = RealEstatePMSListingAssignment.objects.update_or_create(real_estate_id=owner_id, listing_id=listing_id, agent_id=agent_id, defaults={'assigned_by_id': profile.id, 'is_active': True, 'updated_at': now, 'created_at': now})
    return {'success': True, 'assignment_id': str(assignment.id), 'listing_id': str(listing_id), 'agent_id': str(agent_id), 'created': created}


def unassign_real_estate_listing(profile, listing_id, agent_id):
    context = _require_real_estate_admin(profile)
    assignment = RealEstatePMSListingAssignment.objects.filter(real_estate_id=context['owner_id'], listing_id=listing_id, agent_id=agent_id, is_active=True).first()
    if not assignment:
        raise ValueError('Active listing assignment not found.')
    assignment.is_active = False
    assignment.updated_at = timezone.now()
    assignment.save(update_fields=['is_active', 'updated_at'])
    return {'success': True, 'listing_id': str(listing_id), 'agent_id': str(agent_id), 'status': 'UNASSIGNED'}


def get_real_estate_listing_assignments(profile, listing_id=None):
    context = get_real_estate_pms_context(profile)
    if not context:
        raise ValueError('Real Estate PMS access denied.')
    filters = {'real_estate_id': context['owner_id'], 'is_active': True}
    if listing_id:
        filters['listing_id'] = listing_id
    if context['pms_role'] not in {'ADMIN', 'TEAM_MANAGER'}:
        filters['agent_id'] = profile.id
    rows = RealEstatePMSListingAssignment.objects.filter(**filters).order_by('-created_at')
    return [{'assignment_id': str(row.id), 'listing_id': str(row.listing_id), 'agent_id': str(row.agent_id), 'assigned_by_id': str(row.assigned_by_id), 'created_at': row.created_at} for row in rows]


def _pms_listing_key(profile):
    if profile.role == 'landlord':
        return 'subscription_id'
    if profile.role == 'real_estate':
        return 'real_estate_subscription_id'
    raise ValueError('PMS is available only to landlord and real-estate accounts.')


def _listing_payload(listing, link=None):
    return {'id': str(listing.id), 'title': listing.title, 'city': listing.city, 'county': listing.county, 'price_kes': listing.price_kes, 'is_published': listing.is_published, 'status': listing.status, 'approval_status': listing.approval_status, 'is_approved': listing.is_approved, 'is_property_management': listing.is_property_management, 'subscription_listing_id': str(link.id) if link else None, 'subscription_id': str(link.subscription_id) if link and link.subscription_id else None, 'activated_at': link.activated_at if link else None, 'deactivated_at': link.deactivated_at if link else None}


def get_my_pms_listings(profile):
    subscription = get_current_subscription(profile)
    if not subscription:
        return []
    key = _pms_listing_key(profile)
    links = SubscriptionListing.objects.filter(**{key: subscription.id}, status='ACTIVE')
    listing_ids = links.values_list('listing_id', flat=True)
    listings = Listing.objects.filter(id__in=listing_ids, user_id=profile.id).order_by('created_at')
    link_by_listing = {str(link.listing_id): link for link in links}
    return [_listing_payload(listing, link_by_listing.get(str(listing.id))) for listing in listings]


def get_available_pms_listings(profile):
    subscription = get_current_subscription(profile)
    if not subscription:
        return []
    key = _pms_listing_key(profile)
    linked_ids = SubscriptionListing.objects.filter(**{key: subscription.id}, status='ACTIVE').values('listing_id')
    listings = Listing.objects.filter(user_id=profile.id, is_property_management=False).exclude(id__in=linked_ids).order_by('-created_at')
    return [_listing_payload(listing) for listing in listings]


def get_pms_unit_count(profile):
    subscription = get_current_subscription(profile)
    if not subscription:
        return {'unit_count': 0, 'max_units': None, 'remaining_units': None}
    plan = get_subscription_plan(subscription)
    key = _pms_listing_key(profile)
    managed_count = SubscriptionListing.objects.filter(**{key: subscription.id}, status='ACTIVE').count()
    max_listings = plan.max_listings if plan else None
    return {'unit_count': managed_count, 'max_units': max_listings, 'remaining_units': None if max_listings is None else max(0, max_listings - managed_count)}


def add_listing_to_pms(profile, listing_id):
    access = get_pms_access(profile)
    if not access.get('allowed'):
        raise ValueError(access.get('reason', 'PMS access denied.'))
    if access.get('read_only'):
        raise ValueError('PMS is read-only during the grace period.')
    try:
        listing = Listing.objects.get(pk=listing_id, user_id=profile.id)
    except Listing.DoesNotExist as exc:
        raise ValueError('Listing not found or not owned by you.') from exc
    key = _pms_listing_key(profile)
    subscription_model = LandlordSubscription if profile.role == 'landlord' else RealEstateSubscription
    owner_field = 'landlord_id' if profile.role == 'landlord' else 'real_estate_id'
    with transaction.atomic():
        subscription = subscription_model.objects.select_for_update().filter(pk=access['subscription_id'], **{owner_field: profile.id}).first()
        if not subscription or subscription.status not in {'ACTIVE', 'GRACE_PERIOD'}:
            raise ValueError('PMS subscription is not active.')
        plan = get_subscription_plan(subscription)
        if not plan:
            raise ValueError('PMS subscription plan not found.')
        existing = SubscriptionListing.objects.filter(**{key: subscription.id, 'listing_id': listing.id}).first()
        if existing and existing.status == 'ACTIVE':
            raise ValueError('Listing is already managed by this PMS subscription.')
        active_count = SubscriptionListing.objects.filter(**{key: subscription.id}, status='ACTIVE').count()
        if plan.max_listings is not None and active_count >= plan.max_listings:
            raise ValueError(f'Your {plan.name} PMS plan supports a maximum of {plan.max_listings} managed listings. Please upgrade your PMS plan.')
        now = timezone.now()
        if existing:
            existing.status = 'ACTIVE'; existing.activated_at = now; existing.deactivated_at = None; existing.save(update_fields=['status', 'activated_at', 'deactivated_at']); link = existing
        else:
            link = SubscriptionListing.objects.create(**{key: subscription.id}, listing_id=listing.id, status='ACTIVE', activated_at=now, created_at=now)
    return {'success': True, 'subscription_id': str(subscription.id), 'listing_id': str(listing.id), 'plan': plan.name, 'managed_listings': active_count + 1, 'max_listings': plan.max_listings, 'subscription_listing_id': str(link.id)}


def remove_listing_from_pms(profile, listing_id):
    access = get_pms_access(profile)
    if not access.get('allowed'):
        raise ValueError(access.get('reason', 'PMS access denied.'))
    if access.get('read_only'):
        raise ValueError('PMS is read-only during the grace period.')
    subscription_model = LandlordSubscription if profile.role == 'landlord' else RealEstateSubscription
    owner_field = 'landlord_id' if profile.role == 'landlord' else 'real_estate_id'
    key = _pms_listing_key(profile)
    subscription = subscription_model.objects.filter(pk=access['subscription_id'], **{owner_field: profile.id}).first()
    if not subscription:
        raise ValueError('PMS subscription is not active.')
    with transaction.atomic():
        link = SubscriptionListing.objects.filter(**{key: subscription.id, 'listing_id': listing_id, 'status': 'ACTIVE'}).first()
        if not link:
            raise ValueError('Listing is not currently managed by this PMS subscription.')
        if not Listing.objects.filter(pk=listing_id, user_id=profile.id).exists():
            raise ValueError('Listing not found or not owned by you.')
        link.status = 'INACTIVE'; link.deactivated_at = timezone.now(); link.save(update_fields=['status', 'deactivated_at'])
    return {'success': True, 'subscription_id': str(subscription.id), 'listing_id': str(listing_id), 'status': 'INACTIVE'}