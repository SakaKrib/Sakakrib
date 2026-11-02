from channels.generic.websocket import AsyncJsonWebsocketConsumer

from .realtime_events import user_event_group_name


class UserLiveEventsConsumer(AsyncJsonWebsocketConsumer):
    """Authenticated per-user stream of business-record change notifications."""

    async def connect(self):
        self.user = self.scope.get("user")
        if (
            not self.user
            or not getattr(self.user, "is_authenticated", False)
            or not getattr(self.user, "is_active", False)
        ):
            await self.close(code=4403)
            return

        self.group_name = user_event_group_name(self.user.pk)
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        await self.send_json({"type": "ready", "channel": "user-events"})

    async def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive_json(self, content, **kwargs):
        if isinstance(content, dict) and content.get("type") == "ping":
            await self.send_json({"type": "pong"})

    async def live_event(self, event):
        await self.send_json(event.get("event") or {})
