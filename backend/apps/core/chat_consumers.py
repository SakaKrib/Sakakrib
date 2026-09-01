import hashlib

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.core.exceptions import ValidationError

from .chat_services import conversation_id_for_users, send_message, serialize_message
from .domain_bookings import ChatMessage


class MovingChatConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        self.user = self.scope.get("user")
        self.conversation_id = self.scope["url_route"]["kwargs"].get("conversation_id", "")
        if not self.user or not await self._authorized_conversation():
            await self.close(code=4403)
            return
        digest = hashlib.sha256(self.conversation_id.encode()).hexdigest()[:40]
        self.group_name = f"chat_{digest}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive_json(self, content, **kwargs):
        try:
            receiver_id = content.get("receiver_id")
            if not receiver_id:
                raise ValidationError("receiver_id is required")
            message = await self._send(
                receiver_id=receiver_id,
                content=content.get("content", ""),
                message_type=content.get("message_type", "text"),
                event_data=content.get("event_data"),
            )
            await self.channel_layer.group_send(
                self.group_name,
                {"type": "chat.message", "message": serialize_message(message)},
            )
        except (ValidationError, ValueError, TypeError) as exc:
            await self.send_json({"type": "error", "detail": str(exc)})

    async def chat_message(self, event):
        await self.send_json({"type": "message", "message": event["message"]})

    @database_sync_to_async
    def _authorized_conversation(self):
        parts = self.conversation_id.split("__")
        if len(parts) != 2 or str(self.user.pk) not in parts:
            return False
        try:
            return conversation_id_for_users(parts[0], parts[1]) == self.conversation_id
        except Exception:
            return False

    @database_sync_to_async
    def _send(self, **kwargs):
        return send_message(sender_id=self.user.pk, **kwargs)
