from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .domain_property import PlatformSettings


class PlatformSettingsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        settings = PlatformSettings.objects.filter(id=True).first()
        if not settings:
            return Response({'detail': 'Platform settings are not configured in the database.'}, status=404)
        return Response({
            'id': bool(settings.id),
            'mover_commission_rate': settings.mover_commission_rate,
            'mover_operational_markup_rate': settings.mover_operational_markup_rate,
            'created_at': settings.created_at,
            'updated_at': settings.updated_at,
        })
