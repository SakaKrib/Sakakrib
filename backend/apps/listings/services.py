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


def _current_subscription(profile):
    now = timezone.now()
    model = LandlordSubscription if profile.role == 'landlord' else RealEstateSubscription
    owner = 'landlord_id' if profile.role == 'landlord' else 'real_estate_id'
    return model.objects.filter(**{owner: profile.id}).filter(
        Q(status='ACTIVE', current_period_end__gt=now) |
        Q(status='GRACE_PERIOD', grace_period_end__gt=now)
    ).order_by('-created_at').first()


def _subscription_usage(subscription, role, user_id):
    owned = Listing.objects.filter(user_id=user_id).values('id')
    kwargs = {'subscription_id': subscription.id} if role == 'landlord' else {'real_estate_subscription_id': subscription.id}
    return SubscriptionListing.objects.filter(**kwargs, status='ACTIVE', listing_id__in=owned).count()


def get_listing_entitlement(profile):
    if profile.role not in ('landlord', 'real_estate'):
        return {'authorized': False, 'can_create': False, 'reason': 'INVALID_ROLE'}
    if profile.role == 'landlord':
        application_approved = profile.landlord_application_status == 'approved'
    else:
        application_approved = profile.real_estate_application_status == 'approved'
    can_start = profile.verification_status == 'verified' and application_approved
    free_used = profile.free_listings_used or 0
    free_remaining = max(FREE_LIMIT - free_used, 0)
    subscription = _current_subscription(profile)
    used = 0
    limit = None
    plan_obj = None
    if subscription:
        from apps.subscriptions.models import SubscriptionPlan
        plan_obj = SubscriptionPlan.objects.get(pk=subscription.plan_id)
        limit = plan_obj.max_listings
        used = _subscription_usage(subscription, profile.role, profile.id)
        remaining = None if limit is None else max(limit - used, 0)
    else:
        remaining = None
    can_create = bool(can_start and (free_remaining > 0 or (subscription and (limit is None or remaining > 0))))
    requires_individual = bool(can_start and not can_create)
    return {
        'authorized': True, 'role': profile.role, 'can_start_listing': can_start, 'can_create': can_create,
        'free_limit': FREE_LIMIT, 'free_listings_used': free_used, 'free_listings_remaining': free_remaining,
        'subscription_id': subscription.id if subscription else None,
        'subscription_plan': plan_obj.name if plan_obj else None,
        'subscription_status': subscription.status if subscription else None,
        'subscription_limit': limit, 'subscription_listings_used': used,
        'subscription_listings_remaining': remaining,
        'requires_subscription': bool(requires_individual and subscription is None),
        'requires_individual_payment': requires_individual,
        'individual_listing_price_kes': INDIVIDUAL_LISTING_PRICE_KES,
    }


def _create_listing_from_data(profile, data, *, entitlement=None, listing_entitlement=None):
    entitlement = entitlement or get_listing_entitlement(profile)
    listing = Listing.objects.create(
        user_id=profile.id, title=data.get('title', ''), description=data.get('description', ''),
        city=data.get('city', ''), county=data.get('county', ''), location_search=data.get('location_search'),
        latitude=data.get('latitude'), longitude=data.get('longitude'), property_name=data.get('property_name'),
        property_type=data.get('property_type'), price_kes=data.get('price_kes'), listing_type=data.get('listing_type', 'rent'),
        deposit_required=data.get('deposit_required', False), deposit_structure=data.get('deposit_structure'),
        deposit_amount=data.get('deposit_amount', 0), size=data.get('size'), beds=data.get('beds', 0), baths=data.get('baths', 0),
        contact_phone=data.get('contact_phone'), contact_email=data.get('contact_email'), social_links=data.get('social_links', []),
        booking_enabled=data.get('booking_enabled', False), payment_enabled=data.get('payment_enabled', False),
        is_property_management=data.get('is_property_management', False), is_paid=True, is_published=False,
        approval_status='pending_review', is_approved=False, status='pending',
    )
    if listing_entitlement == 'INDIVIDUAL_PAID':
        result = {'success': True, 'listing_created': True, 'listing_id': listing.id,
                  'listing_entitlement': 'INDIVIDUAL_PAID', 'payment_required': False,
                  'is_published': False, 'approval_status': 'pending_review'}
    elif entitlement['free_listings_remaining'] > 0:
        profile.free_listings_used = (profile.free_listings_used or 0) + 1
        profile.save(update_fields=['free_listings_used'])
        listing_entitlement = 'FREE'
        result = {'success': True, 'listing_created': True, 'listing_id': listing.id,
                  'listing_entitlement': listing_entitlement, 'payment_required': False,
                  'is_published': False, 'approval_status': 'pending_review'}
    else:
        if not entitlement.get('subscription_id'):
            raise ValidationError('No active subscription entitlement is available for this listing.')
        SubscriptionListing.objects.create(
            subscription_id=entitlement['subscription_id'] if profile.role == 'landlord' else None,
            real_estate_subscription_id=entitlement['subscription_id'] if profile.role == 'real_estate' else None,
            listing_id=listing.id, status='ACTIVE', activated_at=timezone.now(),
        )
        listing_entitlement = 'SUBSCRIPTION'
        result = {'success': True, 'listing_created': True, 'listing_id': listing.id,
                  'listing_entitlement': listing_entitlement, 'payment_required': False,
                  'is_published': False, 'approval_status': 'pending_review'}

    dispatch_user_notification(
        user_id=profile.id,
        notification_type='LISTING_POSTED',
        title='Listing Posted Successfully - Saka Krib',
        message=f'Your property listing "{listing.title}" has been successfully created and is now awaiting administrator approval.',
        data={'listing_id': str(listing.id)},
        event_key=f'listing:posted:{listing.id}',
        send_email=True,
        email_template='listing_posted',
    )
    return result


@transaction.atomic
def create_listing(profile, data):
    profile = Profile.objects.select_for_update().get(pk=profile.id)
    entitlement = get_listing_entitlement(profile)
    if not entitlement.get('can_start_listing'):
        raise ValidationError('Identity verification and application approval are required before creating a listing.')
    if data.get('is_property_management'):
        if profile.role != 'landlord':
            raise ValidationError('Property management listings are currently available only to landlord accounts.')
        if entitlement.get('subscription_id') is None:
            raise ValidationError('PMS subscription required for property management listings.')
    if not entitlement.get('can_create'):
        return {'success': False, 'listing_created': False, **entitlement}
    return _create_listing_from_data(profile, data, entitlement=entitlement)


@transaction.atomic
def create_listing_payment_intent(profile, listing_data):
    profile = Profile.objects.select_for_update().get(pk=profile.id)
    entitlement = get_listing_entitlement(profile)
    if not entitlement.get('can_start_listing'):
        raise ValidationError('Identity verification and application approval are required before payment.')
    if entitlement.get('can_create'):
        raise ValidationError('A free or subscription listing entitlement is available.')

    # A payment intent represents a listing that will be created after payment.
    # Validate the listing payload before taking the user into a payment flow so a
    # successful provider payment cannot be followed by a predictable bad-data DB failure.
    from .serializers import ListingCreateSerializer
    serializer = ListingCreateSerializer(data=listing_data)
    serializer.is_valid(raise_exception=True)
    validated_listing_data = serializer.validated_data

    if validated_listing_data.get('is_property_management'):
        if profile.role != 'landlord':
            raise ValidationError('Property management listings are currently available only to landlord accounts.')
        if entitlement.get('subscription_id') is None:
            raise ValidationError('PMS subscription required for property management listings.')

    ListingPaymentIntent.objects.filter(user_id=profile.id, status='PENDING').update(status='CANCELLED', updated_at=timezone.now())
    intent = ListingPaymentIntent.objects.create(user_id=profile.id, role=profile.role,
        amount_kes=INDIVIDUAL_LISTING_PRICE_PRICE_KES if False else INDIVIDUAL_LISTING_PRICE_KES, status='PENDING', listing_data=validated_listing_data)
    return {'success': True, 'payment_intent_created': True, 'listing_created': False,
            'payment_intent_id': intent.id, 'amount_kes': INDIVIDUAL_LISTING_PRICE_KES, 'status': 'PENDING'}


@transaction.atomic
def finalize_listing_payment(intent_id, *, provider, provider_reference, provider_amount=None,
                            provider_currency=None, provider_transaction_id=None, checkout_request_id=None,
                            merchant_request_id=None, mpesa_receipt=None, phone_number=None, result_code=None,
                            result_description=None, paypal_order_id=None, paypal_fx_rate=None):
    """Compatibility wrapper for the single authoritative listing-payment finalizer.

    New code must call ``apps.listings.payment_services.process_listing_payment``.
    This wrapper deliberately does not contain a second settlement implementation.
    ``provider_transaction_id`` is retained only for call compatibility because the
    production-aligned ListingPayment model no longer stores that field.
    """
    from .payment_services import process_listing_payment

    del provider_transaction_id
    return process_listing_payment(
        intent_id,
        provider=provider,
        payment_method=provider,
        provider_reference=provider_reference,
        checkout_request_id=checkout_request_id,
        merchant_request_id=merchant_request_id,
        mpesa_receipt=mpesa_receipt,
        phone_number=phone_number,
        result_code=result_code,
        result_description=result_description,
        provider_amount=provider_amount,
        provider_currency=provider_currency,
        paypal_order_id=paypal_order_id,
        paypal_fx_rate=paypal_fx_rate,
    )