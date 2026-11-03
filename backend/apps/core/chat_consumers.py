import hashlib

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.core.exceptions import ValidationError

from .chat_services import send_message, validate_conversation_for_user


def user_chat_group_name(user_id):
    digest = hashlib.sha256(str(user_id).encode()).hexdigest()[:40]
    return f"chat_inbox_{digest}"


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
        await self.send_json({"type": "ready", "conversation_id": self.conversation_id})

    async def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive_json(self, content, **kwargs):
        try:
            receiver_id = content.get("receiver_id")
            if not receiver_id:
                raise ValidationError("receiver_id is required")
            expected_receiver = await self._other_participant()
            if str(receiver_id) != str(expected_receiver):
                raise ValidationError("Receiver is not a participant in this conversation")

            await self._send(
                receiver_id=expected_receiver,
                content=content.get("content", ""),
                message_type=content.get("message_type", "text"),
                event_data=content.get("event_data"),
            )
            # ChatMessage post_save publishes to the conversation and inbox groups
            # after the database transaction commits.
        except (ValidationError, ValueError, TypeError) as exc:
            await self.send_json({"type": "error", "detail": str(exc)})

    async def chat_message(self, event):
        await self.send_json({"type": "message", "message": event["message"]})

    @database_sync_to_async
    def _authorized_conversation(self):
        try:
            validate_conversation_for_user(
                user_id=self.user.pk,
                conversation_id=self.conversation_id,
            )
            return True
        except (ValidationError, ValueError, TypeError):
            return False

    @database_sync_to_async
    def _other_participant(self):
        parts = self.conversation_id.split("__")
        if len(parts) != 2:
            raise ValidationError("Invalid conversation id")
        return parts[1] if parts[0] == str(self.user.pk) else parts[0]

    @database_sync_to_async
    def _send(self, **kwargs):
        return send_message(sender_id=self.user.pk, **kwargs)


class MovingChatInboxConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        self.user = self.scope.get("user")
        if not self.user or not getattr(self.user, "is_authenticated", False):
            await self.close(code=4403)
            return
        self.group_name = user_chat_group_name(self.user.pk)
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        await self.send_json({"type": "ready", "scope": "chat_inbox"})

    async def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive_json(self, content, **kwargs):
        if isinstance(content, dict) and content.get("type") == "ping":
            await self.send_json({"type": "pong"})
            return
        await self.send_json({"type": "info", "detail": "Booking and chat events are server-pushed."})

    async def chat_inbox_message(self, event):
        await self.send_json({"type": "message", "message": event["message"]})

    async def booking(self, event):
        await self.send_json({"type": "booking", "booking": event["booking"]})

    async def notification(self, event):
        await self.send_json({"type": "notification", "notification": event["notification"]})
