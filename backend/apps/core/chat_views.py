from datetime import datetime

from django.core.exceptions import ValidationError
from django.http import JsonResponse
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from .access_scopes import chat_messages_for_user
from .chat_services import list_conversation, send_message, serialize_message


def _error(exc):
    return JsonResponse({"detail": str(exc)}, status=400)


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
