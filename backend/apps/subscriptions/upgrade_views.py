from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .upgrade_services import create_mpesa_subscription_upgrade, create_paypal_subscription_upgrade


class SubscriptionUpgradeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        provider = str(request.data.get('provider') or 'mpesa').lower()
        try:
            if provider == 'paypal':
                result = create_paypal_subscription_upgrade(
                    profile=request.user,
                    target_plan_id=request.data.get('target_plan_id'),
                    billing_cycle=request.data.get('billing_cycle'),
                )
            elif provider == 'mpesa':
                result = create_mpesa_subscription_upgrade(
                    profile=request.user,
                    target_plan_id=request.data.get('target_plan_id'),
                    billing_cycle=request.data.get('billing_cycle'),
                    phone_number=request.data.get('phone_number') or getattr(request.user, 'phone', None),
                )
            else:
                return Response({'success': False, 'detail': 'provider must be mpesa or paypal'}, status=400)
        except ValueError as exc:
            return Response({'success': False, 'detail': str(exc)}, status=400)
        except RuntimeError as exc:
            return Response({'success': False, 'detail': str(exc)}, status=502)
        return Response(result)
