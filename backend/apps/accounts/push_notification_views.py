from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import PushDeviceToken


class PushDeviceRegistrationView(APIView):
    """Register the current authenticated user's native FCM device token."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        token = str(request.data.get('token') or '').strip()
        platform = str(request.data.get('platform') or 'android').strip().lower()

        if not token or len(token) > 8192:
            return Response({'detail': 'A valid push registration token is required.'}, status=400)
        if platform not in {'android', 'ios'}:
            return Response({'detail': 'platform must be android or ios.'}, status=400)

        device, _ = PushDeviceToken.objects.update_or_create(
            token=token,
            defaults={
                'user': request.user,
                'platform': platform,
                'is_active': True,
            },
        )
        return Response({
            'registered': True,
            'device_id': device.pk,
            'platform': device.platform,
        }, status=201)


class PushDeviceUnregisterView(APIView):
    """Deactivate push delivery for this account's device tokens on sign-out."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        token = str(request.data.get('token') or '').strip()
        devices = PushDeviceToken.objects.filter(user=request.user, is_active=True)
        if token:
            devices = devices.filter(token=token)
        updated = devices.update(is_active=False)
        return Response({'unregistered': True, 'devices_updated': updated}, status=200)
