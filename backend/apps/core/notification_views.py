from django.http import JsonResponse
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from .domain_platform import RenterNotification, UserNotification


def _serialize_user(row):
    return {
        "id": str(row.id),
        "notification_type": row.notification_type,
        "title": row.title,
        "message": row.message,
        "data": row.data,
        "read_at": row.read_at.isoformat() if row.read_at else None,
        "created_at": row.created_at.isoformat(),
    }


def _serialize_renter(row):
    return {
        "id": str(row.id),
        "notification_type": row.notification_type,
        "title": row.title,
        "body": row.body,
        "action_type": row.action_type,
        "action_payload": row.action_payload,
        "read_at": row.read_at.isoformat() if row.read_at else None,
        "created_at": row.created_at.isoformat(),
    }


class UserNotificationView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        limit = max(1, min(int(request.query_params.get("limit", 50)), 100))
        rows = list(UserNotification.objects.filter(user_id=request.user.pk).order_by("-created_at")[:limit])
        return JsonResponse({"notifications": [_serialize_user(r) for r in rows]}, status=200)

    def patch(self, request):
        notification_id = request.data.get("id")
        if not notification_id:
            return JsonResponse({"detail": "id is required"}, status=400)
        row = UserNotification.objects.filter(id=notification_id, user_id=request.user.pk).first()
        if not row:
            return JsonResponse({"detail": "Notification not found"}, status=404)
        row.read_at = timezone.now()
        row.save(update_fields=["read_at"])
        return JsonResponse({"notification": _serialize_user(row)}, status=200)


class RenterNotificationView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        limit = max(1, min(int(request.query_params.get("limit", 50)), 100))
        rows = list(RenterNotification.objects.filter(renter_user_id=request.user.pk).order_by("-created_at")[:limit])
        return JsonResponse({"notifications": [_serialize_renter(r) for r in rows]}, status=200)

    def patch(self, request):
        notification_id = request.data.get("id")
        if not notification_id:
            return JsonResponse({"detail": "id is required"}, status=400)
        row = RenterNotification.objects.filter(id=notification_id, renter_user_id=request.user.pk).first()
        if not row:
            return JsonResponse({"detail": "Notification not found"}, status=404)
        row.read_at = timezone.now()
        row.save(update_fields=["read_at"])
        return JsonResponse({"notification": _serialize_renter(row)}, status=200)
