from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.subscriptions.models import RealEstatePMSSettings
from apps.subscriptions.services import get_real_estate_pms_context


class RealEstatePMSSettingsView(APIView):
    permission_classes = [IsAuthenticated]

    def _admin_context(self, request):
        context = get_real_estate_pms_context(request.user)
        if not context or context.get('pms_role') != 'ADMIN':
            return None
        return context

    def get(self, request):
        context = self._admin_context(request)
        if not context:
            return Response({'detail': 'Real-estate PMS administrator access is required.'}, status=403)

        settings, _ = RealEstatePMSSettings.objects.get_or_create(
            real_estate_id=context['owner_id'],
            defaults={'created_at': timezone.now(), 'updated_at': timezone.now()},
        )
        return Response({
            'real_estate_id': str(settings.real_estate_id),
            'default_rent_due_day': settings.default_rent_due_day,
            'default_payment_tracking_enabled': settings.default_payment_tracking_enabled,
            'updated_at': settings.updated_at,
        })

    def patch(self, request):
        context = self._admin_context(request)
        if not context:
            return Response({'detail': 'Real-estate PMS administrator access is required.'}, status=403)

        settings, _ = RealEstatePMSSettings.objects.get_or_create(
            real_estate_id=context['owner_id'],
            defaults={'created_at': timezone.now(), 'updated_at': timezone.now()},
        )

        if 'default_rent_due_day' in request.data:
            try:
                value = int(request.data['default_rent_due_day'])
            except (TypeError, ValueError):
                return Response({'detail': 'Default rent due day must be an integer.'}, status=400)
            if value not in range(1, 32):
                return Response({'detail': 'Default rent due day must be between 1 and 31.'}, status=400)
            settings.default_rent_due_day = value

        if 'default_payment_tracking_enabled' in request.data:
            value = request.data['default_payment_tracking_enabled']
            if not isinstance(value, bool):
                return Response({'detail': 'Default payment tracking setting must be a boolean.'}, status=400)
            settings.default_payment_tracking_enabled = value

        settings.updated_at = timezone.now()
        settings.save(update_fields=['default_rent_due_day', 'default_payment_tracking_enabled', 'updated_at'])
        return Response({
            'real_estate_id': str(settings.real_estate_id),
            'default_rent_due_day': settings.default_rent_due_day,
            'default_payment_tracking_enabled': settings.default_payment_tracking_enabled,
            'updated_at': settings.updated_at,
        })
