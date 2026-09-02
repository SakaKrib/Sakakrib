from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.accounts.models import Profile
from apps.core.notification_services import dispatch_user_notification
from apps.subscriptions.models import LandlordSubscription, RealEstateSubscription, SubscriptionListing
from apps.payments.models import ListingPayment
from .models import Listing, ListingPaymentIntent

FREE_LIMIT = settings.LISTING_FREE_LIMIT
INDIVIDUAL_LISTING_PRICE_KES = settings.INDIVIDUAL_LISTING_PRICE_KES
ROLES = {'landlord', 'real_estate'}


def _current_subscription(profile, lock=False):
    if profile.role not in ROLES:
        return None
    now = timezone.now()
    model = LandlordSubscription if profile.role == 'landlord' else RealEstateSubscription
    owner = 'landlord_id' if profile.role == 'landlord' else 'real_estate_id'
    qs = model.objects.filter(**{owner: profile.id}).filter(Q(status='ACTIVE', current_period_end__gt=now) | Q(status='GRACE_PERIOD', grace_period_end__gt=now)).order_by('-created_at')
    return (qs.select_for_update() if lock else qs).first()


def _application_approved(profile):
    field = 'landlord_application_status' if profile.role == 'landlord' else 'real_estate_application_status'
    return getattr(profile, field, None) == 'approved'


def _subscription_usage(subscription, role, user_id):
    owned = Listing.objects.filter(user_id=user_id).values('id')
    key = 'subscription_id' if role == 'landlord' else 'real_estate_subscription_id'
    return SubscriptionListing.objects.filter(**{key: subscription.id}, status='ACTIVE', listing_id__in=owned).count()


def get_listing_entitlement(profile, *, lock_subscription=False):
    """Authoritative Django listing entitlement for landlord and real-estate accounts."""
    role = str(getattr(profile, 'role', '') or '').strip().lower()
    if role not in ROLES:
        return {'authorized': False, 'role': role or None, 'can_start_listing': False, 'can_create': False,
                'entitlement_source': None, 'requires_individual_payment': False, 'requires_subscription': False,
                'individual_listing_price_kes': INDIVIDUAL_LISTING_PRICE_KES, 'reason': 'INVALID_ROLE'}
    identity_verified = str(getattr(profile, 'verification_status', '') or '').lower() == 'verified'
    kyc_completed = bool(getattr(profile, 'kyc_completed', False))
    can_start = identity_verified and kyc_completed and _application_approved(profile)
    free_used = max(int(profile.free_listings_used or 0), 0)
    free_remaining = max(FREE_LIMIT - free_used, 0)
    subscription = _current_subscription(profile, lock=lock_subscription)
    active = bool(subscription and subscription.status == 'ACTIVE' and subscription.current_period_end and subscription.current_period_end > timezone.now())
    plan = None
    used = 0
    limit = None
    if subscription:
        from apps.subscriptions.models import SubscriptionPlan
        plan = SubscriptionPlan.objects.filter(pk=subscription.plan_id).first()
        if plan:
            limit = plan.max_listings
            used = _subscription_usage(subscription, role, profile.id)
    remaining = None if limit is None else max(limit - used, 0)
    source = 'FREE' if can_start and free_remaining > 0 else ('SUBSCRIPTION' if can_start and active and (limit is None or remaining > 0) else None)
    can_create = source is not None
    needs_payment = can_start and not can_create
    return {
        'authorized': True, 'role': role, 'verification_status': getattr(profile, 'verification_status', None),
        'kyc_completed': kyc_completed, 'landlord_application_status': getattr(profile, 'landlord_application_status', None),
        'real_estate_application_status': getattr(profile, 'real_estate_application_status', None),
        'can_start_listing': can_start, 'can_create': can_create, 'entitlement_source': source,
        'free_limit': FREE_LIMIT, 'free_listings_used': free_used, 'free_listings_remaining': free_remaining,
        'subscription_id': subscription.id if subscription else None, 'plan_id': plan.id if plan else None,
        'subscription_plan': plan.name if plan else None, 'subscription_status': subscription.status if subscription else None,
        'billing_cycle': subscription.billing_cycle if subscription else None, 'subscription_limit': limit,
        'max_listings': limit, 'max_units_per_listing': plan.max_units_per_listing if plan else None,
        'subscription_listings_used': used, 'subscription_listings_remaining': remaining,
        'requires_individual_payment': bool(needs_payment), 'requires_subscription': bool(needs_payment and not active),
        'individual_listing_price_kes': INDIVIDUAL_LISTING_PRICE_KES, 'upgrade_available': bool(needs_payment),
    }


def _create_listing_from_data(profile, data, *, entitlement=None, listing_entitlement=None, notify=True):
    entitlement = entitlement or get_listing_entitlement(profile)
    listing = Listing.objects.create(
        user_id=profile.id, title=data.get('title', ''), description=data.get('description', ''), city=data.get('city', ''),
        county=data.get('county', ''), location_search=data.get('location_search'), latitude=data.get('latitude'), longitude=data.get('longitude'),
        property_name=data.get('property_name'), property_type=data.get('property_type'), price_kes=data.get('price_kes'), listing_type=data.get('listing_type', 'rent'),
        deposit_required=data.get('deposit_required', False), deposit_structure=data.get('deposit_structure'), deposit_amount=data.get('deposit_amount', 0),
        size=data.get('size'), beds=data.get('beds', 0), baths=data.get('baths', 0), contact_phone=data.get('contact_phone'), contact_email=data.get('contact_email'),
        social_links=data.get('social_links', []), booking_enabled=data.get('booking_enabled', False), payment_enabled=data.get('payment_enabled', False),
        is_property_management=data.get('is_property_management', False), is_paid=True, is_published=False, approval_status='pending_review', is_approved=False, status='pending')
    if listing_entitlement == 'INDIVIDUAL_PAID':
        source = 'INDIVIDUAL_PAID'
    elif entitlement.get('entitlement_source') == 'FREE':
        profile.free_listings_used = (profile.free_listings_used or 0) + 1
        profile.save(update_fields=['free_listings_used'])
        source = 'FREE'
    elif entitlement.get('entitlement_source') == 'SUBSCRIPTION':
        key = 'subscription_id' if profile.role == 'landlord' else 'real_estate_subscription_id'
        SubscriptionListing.objects.create(**{key: entitlement['subscription_id'], 'listing_id': listing.id, 'status': 'ACTIVE', 'activated_at': timezone.now(), 'created_at': timezone.now()})
        source = 'SUBSCRIPTION'
    else:
        listing.delete()
        raise ValidationError('No valid listing entitlement is available.')
    result = {'success': True, 'listing_created': True, 'listing_id': listing.id, 'listing_entitlement': source, 'payment_required': False, 'is_published': False, 'approval_status': 'pending_review'}
    if notify:
        transaction.on_commit(lambda: dispatch_user_notification(user_id=profile.id, notification_type='LISTING_POSTED', title='Listing Posted Successfully - Saka Krib', message=f'Your property listing "{listing.title}" has been successfully created and is now awaiting administrator approval.', data={'listing_id': str(listing.id)}, event_key=f'listing:posted:{listing.id}', send_email=True, email_template='listing_posted'))
    return result


@transaction.atomic
def create_listing(profile, data):
    profile = Profile.objects.select_for_update().get(pk=profile.id)
    entitlement = get_listing_entitlement(profile, lock_subscription=True)
    if not entitlement.get('can_start_listing'):
        raise ValidationError('Identity verification, KYC completion, and application approval are required before creating a listing.')
    if data.get('is_property_management'):
        if profile.role not in ROLES or entitlement.get('subscription_status') != 'ACTIVE':
            raise ValidationError('An active PMS subscription is required for property management listings.')
    if not entitlement.get('can_create'):
        return {'success': False, 'listing_created': False, **entitlement}
    return _create_listing_from_data(profile, data, entitlement=entitlement)


@transaction.atomic
def create_listing_payment_intent(profile, listing_data):
    profile = Profile.objects.select_for_update().get(pk=profile.id)
    entitlement = get_listing_entitlement(profile, lock_subscription=True)
    if not entitlement.get('can_start_listing'):
        raise ValidationError('Identity verification, KYC completion, and application approval are required before payment.')
    if entitlement.get('can_create'):
        raise ValidationError('A free or active subscription listing entitlement is available.')
    from .serializers import ListingCreateSerializer
    serializer = ListingCreateSerializer(data=listing_data)
    serializer.is_valid(raise_exception=True)
    validated = serializer.validated_data
    if validated.get('is_property_management'):
        raise ValidationError('An active PMS subscription is required for property management listings.')
    ListingPaymentIntent.objects.filter(user_id=profile.id, status='PENDING').update(status='CANCELLED', updated_at=timezone.now())
    intent = ListingPaymentIntent.objects.create(user_id=profile.id, role=profile.role, amount_kes=INDIVIDUAL_LISTING_PRICE_KES, status='PENDING', listing_data=validated)
    return {'success': True, 'payment_intent_created': True, 'listing_created': False, 'payment_intent_id': intent.id, 'amount_kes': INDIVIDUAL_LISTING_PRICE_KES, 'status': 'PENDING'}


@transaction.atomic
def finalize_listing_payment(intent_id, *, provider, provider_reference, provider_amount=None, provider_currency=None, provider_transaction_id=None, checkout_request_id=None, merchant_request_id=None, mpesa_receipt=None, phone_number=None, result_code=None, result_description=None, paypal_order_id=None, paypal_fx_rate=None):
    from .payment_services import process_listing_payment
    del provider_transaction_id
    return process_listing_payment(intent_id, provider=provider, payment_method=provider, provider_reference=provider_reference, checkout_request_id=checkout_request_id, merchant_request_id=merchant_request_id, mpesa_receipt=mpesa_receipt, phone_number=phone_number, result_code=result_code, result_description=result_description, provider_amount=provider_amount, provider_currency=provider_currency, paypal_order_id=paypal_order_id, paypal_fx_rate=paypal_fx_rate)
