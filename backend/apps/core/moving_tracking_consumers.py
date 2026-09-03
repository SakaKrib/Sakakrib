import hashlib
import uuid

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.core.exceptions import ValidationError

from .domain_bookings import Booking, MovingTrackingPoint
from .domain_platform import Mover


def tracking_group_name(booking_id):
    return f"tracking_{hashlib.sha256(str(booking_id).encode()).hexdigest()[:40]}"


class MovingTrackingConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        self.user = self.scope.get("user")
        raw_booking_id = self.scope["url_route"]["kwargs"].get("booking_id")
        try:
            self.booking_id = uuid.UUID(str(raw_booking_id))
        except (TypeError, ValueError):
            await self.close(code=4400)
            return

        if not self.user or not await self._authorized():
            await self.close(code=4403)
            return

        self.group_name = tracking_group_name(self.booking_id)
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        latest = await self._latest()
        await self.send_json({"type": "ready", "booking_id": str(self.booking_id), "location": latest})

    async def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive_json(self, content, **kwargs):
        # GPS writes stay on the authenticated HTTPS endpoint so Django's
        # CSRF/authentication and server-side throttling remain authoritative.
        await self.send_json({"type": "info", "detail": "Send GPS updates through the tracking API."})

    async def moving_location(self, event):
        await self.send_json({"type": "location", "location": event["location"]})

    @database_sync_to_async
    def _authorized(self):
        booking = Booking.objects.filter(pk=self.booking_id).first()
        if not booking:
            return False
        if booking.renter_id == self.user.pk:
            return True
        return Mover.objects.filter(pk=booking.mover_id, user_id=self.user.pk).exists()

    @database_sync_to_async
    def _latest(self):
        point = MovingTrackingPoint.objects.filter(booking_id=self.booking_id).order_by("-recorded_at").first()
        if not point:
            return None
        return {
            "id": point.id,
            "booking_id": str(point.booking_id),
            "mover_id": str(point.mover_id),
            "latitude": point.latitude,
            "longitude": point.longitude,
            "accuracy_meters": point.accuracy_meters,
            "speed_kph": point.speed_kph,
            "heading_degrees": point.heading_degrees,
            "recorded_at": point.recorded_at.isoformat(),
        }
