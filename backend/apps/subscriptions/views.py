from rest_framework.response import Response
from rest_framework.views import APIView

from .models import SubscriptionPlan
from .services import get_current_subscription, get_subscription_access, get_subscription_plan


class SubscriptionPlansView(APIView):
    authentication_classes = []
    permission_classes = []

    def get(self, request):
        audience = request.query_params.get('audience', '').upper()
        queryset = SubscriptionPlan.objects.all().order_by('audience', 'monthly_price_kes')
        if audience in ('LANDLORD', 'REAL_ESTATE'):
            queryset = queryset.filter(audience=audience)
        return Response([
            {
                'id': plan.id,
                'name': plan.name,
                'audience': plan.audience,
                'max_listings': plan.max_listings,
                'max_units_per_listing': plan.max_units_per_listing,
                'monthly_price_kes': plan.monthly_price_kes,
                'annual_price_kes': plan.annual_price_kes,
                'paypal_monthly_plan_id': plan.paypal_monthly_plan_id,
                'paypal_annual_plan_id': plan.paypal_annual_plan_id,
            }
            for plan in queryset
        ])


class MySubscriptionView(APIView):
    def get(self, request):
        profile = request.user.profile
        subscription = get_current_subscription(profile)
        plan = get_subscription_plan(subscription)
        return Response({
            'subscription_id': subscription.id if subscription else None,
            'plan_id': plan.id if plan else None,
            'plan_name': plan.name if plan else None,
            'subscription_status': subscription.status if subscription else None,
            'billing_cycle': subscription.billing_cycle if subscription else None,
            'max_listings': plan.max_listings if plan else None,
            'max_units_per_listing': plan.max_units_per_listing if plan else None,
            'current_period_start': subscription.current_period_start if subscription else None,
            'current_period_end': subscription.current_period_end if subscription else None,
            'grace_period_end': subscription.grace_period_end if subscription else None,
        })


class MySubscriptionAccessView(APIView):
    def get(self, request):
        return Response(get_subscription_access(request.user.profile))
