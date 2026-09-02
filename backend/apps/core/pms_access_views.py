from rest_framework.response import Response

from apps.accounts.authorization import is_admin, pms_access
from .pms_views import PMSActionView as LegacyPMSActionView
from .pms_views import PMSDashboardView as LegacyPMSDashboardView


class PMSDashboardView(LegacyPMSDashboardView):
    """Subscription-protected PMS dashboard boundary."""

    def get(self, request):
        access = pms_access(request.user)
        if not access.get('allowed'):
            return Response({'detail': 'An active PMS subscription is required.', 'pms_access': access}, status=403)
        response = super().get(request)
        if isinstance(response.data, dict):
            response.data['pmsAccess'] = access
        return response


class PMSActionView(LegacyPMSActionView):
    """Subscription-protected PMS mutations.

    Grace-period accounts are read-only. Existing PMS dashboard data remains
    available, but they cannot consume new subscription capacity or mutate PMS
    billing/management state until payment restores an ACTIVE subscription.
    """

    def post(self, request):
        access = pms_access(request.user)
        if not access.get('allowed'):
            return Response({'detail': 'An active PMS subscription is required.', 'pms_access': access}, status=403)
        if access.get('read_only') and not is_admin(request.user):
            return Response({'detail': 'PMS is read-only during the subscription grace period.', 'pms_access': access}, status=403)
        return super().post(request)
