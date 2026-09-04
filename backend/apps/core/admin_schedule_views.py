from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.authorization import is_admin

from .domain_bookings import MoverScheduleEvent


class AdminScheduleEventView(APIView):
    """Administrator calendar read boundary; participants keep the existing schedule endpoint."""

    permission_classes = [IsAuthenticated]

    fields = (
        "id", "mover_id", "booking_id", "starts_at", "ends_at", "status", "title",
        "created_at", "updated_at",
    )

    def get(self, request, object_id=None):
        if not is_admin(request.user):
            return Response({"detail": "Administrator access is required."}, status=403)

        queryset = MoverScheduleEvent.objects.all()
        if object_id is not None:
            obj = queryset.filter(pk=object_id).first()
            if obj is None:
                return Response({"detail": "Not found."}, status=404)
            return Response({field: getattr(obj, field) for field in self.fields})

        return Response([
            {field: getattr(obj, field) for field in self.fields}
            for obj in queryset.order_by("-starts_at")
        ])
