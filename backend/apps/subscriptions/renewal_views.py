from rest_framework.response import Response
from rest_framework.views import APIView

from .renewal_services import create_mpesa_subscription_renewal


class SubscriptionRenewalView(APIView):
    def post(self, request):
        try:
            phone_number = request.data.get('phone_number') or getattr(request.user, 'phone', None)
            result = create_mpesa_subscription_renewal(
                profile=request.user,
                phone_number=phone_number,
            )
        except ValueError as exc:
            return Response({'success': False, 'detail': str(exc)}, status=400)
        except RuntimeError as exc:
            return Response({'success': False, 'detail': str(exc)}, status=502)
        return Response(result)
