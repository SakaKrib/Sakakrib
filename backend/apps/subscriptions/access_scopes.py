"""Queryset scopes corresponding to audited production subscription RLS."""

from django.db.models import Q

from apps.accounts.authorization import is_admin

from .models import (
    LandlordSubscription,
    RealEstateSubscription,
    SubscriptionInvoice,
    SubscriptionListing,
)


def landlord_subscriptions_for_user(user):
    if is_admin(user):
        return LandlordSubscription.objects.all()
    return LandlordSubscription.objects.filter(landlord_id=user.pk)


def real_estate_subscriptions_for_user(user):
    if is_admin(user):
        return RealEstateSubscription.objects.all()
    return RealEstateSubscription.objects.filter(real_estate_id=user.pk)


def subscription_invoices_for_user(user):
    """Invoice visibility follows ownership of either parent subscription."""
    if is_admin(user):
        return SubscriptionInvoice.objects.all()
    landlord_ids = landlord_subscriptions_for_user(user).values("id")
    real_estate_ids = real_estate_subscriptions_for_user(user).values("id")
    return SubscriptionInvoice.objects.filter(
        Q(landlord_subscription_id__in=landlord_ids)
        | Q(real_estate_subscription_id__in=real_estate_ids)
    )


def subscription_listings_for_user(user):
    """Ownership scope for listings attached to either subscription type."""
    if is_admin(user):
        return SubscriptionListing.objects.all()
    landlord_ids = landlord_subscriptions_for_user(user).values("id")
    real_estate_ids = real_estate_subscriptions_for_user(user).values("id")
    return SubscriptionListing.objects.filter(
        Q(subscription_id__in=landlord_ids)
        | Q(real_estate_subscription_id__in=real_estate_ids)
    )
