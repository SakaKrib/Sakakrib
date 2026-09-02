from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.authorization import is_admin
from apps.listings.serializers import ListingSerializer
from apps.listings.services import get_listing_entitlement
from apps.subscriptions.models import RealEstateSubscription, SubscriptionListing, SubscriptionPlan
from apps.subscriptions.services import get_current_subscription, get_pms_access, get_subscription_plan


class RealEstatePMSDashboardView(APIView):
    """Dedicated Django boundary for the real-estate PMS dashboard.

    The endpoint deliberately does not reuse the landlord PMS dashboard.
    Real-estate subscriptions are stored in ``real_estate_subscriptions`` and
    their subscription-listing associations use ``real_estate_subscription_id``.
    Shared listing and entitlement services are reused only where ownership
    semantics are identical.
    """

    def get(self, request):
        profile = request.user
        access = get_pms_access(profile)
        if not access.get('allowed') or access.get('role') != 'real_estate':
            return Response({'detail': 'Real-estate PMS access is required.', 'pms_access': access}, status=403)

        subscription = get_current_subscription(profile)
        plan = get_subscription_plan(subscription)
        entitlement = get_listing_entitlement(profile)

        listings = list(
            ListingSerializer(
                __import__('apps.listings.models', fromlist=['Listing']).Listing.objects.filter(user_id=profile.id).order_by('-created_at'),
                many=True,
                context={'request': request},
            ).data
        )

        managed_ids = set()
        if subscription:
            managed_ids = set(
                str(value)
                for value in SubscriptionListing.objects.filter(
                    real_estate_subscription_id=subscription.id,
                    status='ACTIVE',
                ).values_list('listing_id', flat=True)
            )

        capacity_limit = plan.max_listings if plan else None
        managed_count = len(managed_ids)
        return Response({
            'pms_access': access,
            'subscription': {
                'subscription_id': str(subscription.id),
                'plan_id': str(plan.id) if plan else None,
                'plan_name': plan.name if plan else None,
                'subscription_status': subscription.status,
                'billing_cycle': subscription.billing_cycle,
                'max_listings': plan.max_listings if plan else None,
                'max_units_per_listing': plan.max_units_per_listing if plan else None,
                'current_period_start': subscription.current_period_start,
                'current_period_end': subscription.current_period_end,
                'grace_period_end': subscription.grace_period_end,
            } if subscription else None,
            'entitlement': entitlement,
            'capacity': {
                'listings_used': managed_count,
                'max_listings': capacity_limit,
                'listings_remaining': (
                    max(0, capacity_limit - managed_count)
                    if capacity_limit is not None else None
                ),
                'max_units_per_listing': plan.max_units_per_listing if plan else None,
            },
            'listings': listings,
            'listingSummary': {
                'total': len(listings),
                'published': sum(bool(row.get('is_published')) for row in listings),
                'unpublished': sum(not bool(row.get('is_published')) for row in listings),
                'approved': sum(bool(row.get('is_approved')) for row in listings),
                'pending_approval': sum(
                    not bool(row.get('is_approved'))
                    and str(row.get('approval_status') or '').lower() not in {'rejected', 'declined'}
                    for row in listings
                ),
                'rejected': sum(
                    str(row.get('approval_status') or '').lower() in {'rejected', 'declined'}
                    for row in listings
                ),
                'paid': sum(bool(row.get('is_paid')) for row in listings),
                'unpaid': sum(not bool(row.get('is_paid')) for row in listings),
                'pms_managed': managed_count,
            },
            'plans': [
                {
                    'id': str(item.id),
                    'name': item.name,
                    'audience': item.audience,
                    'max_listings': item.max_listings,
                    'max_units_per_listing': item.max_units_per_listing,
                    'monthly_price_kes': item.monthly_price_kes,
                    'annual_price_kes': item.annual_price_kes,
                }
                for item in SubscriptionPlan.objects.filter(audience='REAL_ESTATE').order_by('monthly_price_kes')
            ],
        })


class RealEstatePMSActionView(APIView):
    """Real-estate-specific PMS mutations.

    Only subscription-listing management is exposed here because those rows
    have a distinct real-estate foreign-key contract. Grace-period accounts
    remain read-only. Rent/payment operations are not routed through this
    endpoint because the existing rent domain is landlord-owned.
    """

    def post(self, request):
        profile = request.user
        access = get_pms_access(profile)
        if not access.get('allowed') or access.get('role') != 'real_estate':
            return Response({'detail': 'Real-estate PMS access is required.', 'pms_access': access}, status=403)
        if access.get('read_only') and not is_admin(profile):
            return Response({'detail': 'PMS is read-only during the subscription grace period.', 'pms_access': access}, status=403)

        action = request.data.get('action')
        subscription = get_current_subscription(profile)
        if not subscription or not isinstance(subscription, RealEstateSubscription):
            return Response({'detail': 'An active real-estate PMS subscription is required.'}, status=403)

        if action == 'add_listing':
            from apps.listings.models import Listing
            listing_id = request.data.get('listing_id')
            listing = Listing.objects.filter(
                id=listing_id,
                user_id=profile.id,
                is_property_management=True,
                is_approved=True,
            ).first()
            if not listing:
                return Response({'detail': 'Approved property-management listing not found.'}, status=404)

            plan = get_subscription_plan(subscription)
            existing = SubscriptionListing.objects.filter(
                real_estate_subscription_id=subscription.id,
                status='ACTIVE',
            ).count()
            already = SubscriptionListing.objects.filter(
                real_estate_subscription_id=subscription.id,
                listing_id=listing.id,
            ).first()
            if already and already.status == 'ACTIVE':
                return Response({'success': True, 'subscription_listing_id': str(already.id), 'already_managed': True})
            if plan and plan.max_listings is not None and existing >= plan.max_listings:
                return Response({'detail': 'Your subscription listing capacity has been reached.'}, status=409)

            if already:
                already.status = 'ACTIVE'
                already.activated_at = __import__('django.utils.timezone', fromlist=['timezone']).timezone.now()
                already.deactivated_at = None
                already.save(update_fields=['status', 'activated_at', 'deactivated_at'])
                obj = already
            else:
                from django.utils import timezone
                obj = SubscriptionListing.objects.create(
                    real_estate_subscription_id=subscription.id,
                    listing_id=listing.id,
                    status='ACTIVE',
                    activated_at=timezone.now(),
                    created_at=timezone.now(),
                )
            return Response({'success': True, 'subscription_listing_id': str(obj.id)})

        if action == 'remove_listing':
            listing_id = request.data.get('listing_id')
            obj = SubscriptionListing.objects.filter(
                real_estate_subscription_id=subscription.id,
                listing_id=listing_id,
                status='ACTIVE',
            ).first()
            if not obj:
                return Response({'detail': 'Managed listing not found.'}, status=404)
            from django.utils import timezone
            obj.status = 'INACTIVE'
            obj.deactivated_at = timezone.now()
            obj.save(update_fields=['status', 'deactivated_at'])
            return Response({'success': True})

        return Response({'detail': 'Unsupported real-estate PMS action.'}, status=400)
