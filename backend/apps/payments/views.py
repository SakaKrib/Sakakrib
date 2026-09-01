from django.conf import settings
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView


class PaymentProviderConfigView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({
            'providers': {
                'mpesa': {
                    'enabled': bool(getattr(settings, 'MPESA_CONSUMER_KEY', '')),
                    'currency': 'KES',
                },
                'paypal': {
                    'enabled': bool(getattr(settings, 'PAYPAL_CLIENT_ID', '')),
                    'currency': 'USD',
                },
            }
        })
