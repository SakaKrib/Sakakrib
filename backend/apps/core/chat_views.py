from datetime import datetime

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.core.exceptions import ValidationError
from django.http import JsonResponse
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from .access_scopes import chat_messages_for_user
from .chat_services import conversation_id_for_users, list_conversation, send_message, serialize_message


def _error(exc):
    return JsonResponse({"detail": str(exc)}, status=400)


def _broadcast(message):
    layer = get_channel_layer()
    if not layer:
        return
    conversation_id = message.conversation_id
    import hashlib
    group_name = f"chat_{hashlib.sha256(conversation_id.encode()).hexdigest()[:40]}"
    async_to_sync(layer.group_send)(
        group_name,
        {"type": "chat.message", "message": serialize_message(message)},
    )


class ChatConversationView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            conversation_id = request.query_params.get("conversation_id", "")
            limit = int(request.query_params.get("limit", 50))
            before = request.query_params.get("before")
            if before:
                before = datetime.fromisoformat(before.replace("Z", "+00:00"))
            messages = list_conversation(
                user_id=request.user.pk,
                conversation_id=conversation_id,
                limit=limit,
                before=before,
            )
            return JsonResponse({"messages": [serialize_message(m) for m in messages]}, status=200)
        except (ValidationError, ValueError, TypeError) as exc:
            return _error(exc)

    def post(self, request):
        try:
            receiver_id = request.data.get("receiver_id")
            if not receiver_id:
                raise ValidationError("receiver_id is required")
            message = send_message(
                sender_id=request.user.pk,
                receiver_id=receiver_id,
                content=request.data.get("content", ""),
                message_type=request.data.get("message_type", "text"),
                event_data=request.data.get("event_data"),
            )
            _broadcast(message)
            return JsonResponse({"message": serialize_message(message)}, status=201)
        except (ValidationError, ValueError, TypeError) as exc:
            return _error(exc)


class ChatMessageView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        message_id = request.query_params.get("id")
        if not message_id:
            return JsonResponse({"detail": "id is required"}, status=400)
        message = chat_messages_for_user(request.user).filter(pk=message_id).first()
        if not message:
            return JsonResponse({"detail": "Message not found"}, status=404)
        return JsonResponse({"message": serialize_message(message)}, status=200)


class RenterChatPerformanceView(APIView):
    """Monthly chat activity summary for the authenticated renter."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            if getattr(request.user, "role", None) != "renter":
                return JsonResponse({"detail": "Renter access is required."}, status=403)

            now = timezone.localtime()
            year = int(request.query_params.get("year", now.year))
            month = int(request.query_params.get("month", now.month))
            if month < 1 or month > 12:
                raise ValidationError("month must be between 1 and 12")
            if year < 2000 or year > 2100:
                raise ValidationError("year is out of range")

            next_month = datetime(year + 1, 1, 1) if month == 12 else datetime(year, month + 1, 1)
            tz = timezone.get_current_timezone()
            start = timezone.make_aware(datetime(year, month, 1), tz)
            end = timezone.make_aware(next_month, tz)
            messages = chat_messages_for_user(request.user).filter(
                created_at__gte=start,
                created_at__lt=end,
            ).order_by("created_at", "id")

            days_in_month = (end.date() - start.date()).days
            daily = [{"day": day, "sent": 0, "received": 0, "total": 0} for day in range(1, days_in_month + 1)]
            conversations = set()
            sent = received = 0
            last_message_at = None
            user_id = str(request.user.pk)

            for message in messages.iterator():
                day = timezone.localtime(message.created_at).day
                row = daily[day - 1]
                row["total"] += 1
                conversations.add(message.conversation_id)
                if str(message.sender_id) == user_id:
                    row["sent"] += 1
                    sent += 1
                else:
                    row["received"] += 1
                    received += 1
                last_message_at = message.created_at

            return JsonResponse({
                "year": year,
                "month": month,
                "total_messages": sent + received,
                "sent_messages": sent,
                "received_messages": received,
                "active_conversations": len(conversations),
                "last_message_at": last_message_at.isoformat() if last_message_at else None,
                "daily": daily,
            }, status=200)
        except (ValidationError, ValueError, TypeError) as exc:
            return _error(exc)
