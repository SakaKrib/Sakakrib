import asyncio
import hashlib
import uuid

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.conf import settings
from django.utils import timezone
from redis.asyncio import Redis

from .domain_bookings import Booking, MovingTrackingPoint
from .domain_journeys import JOURNEY_PHASE_HEADING_TO_PICKUP, MovingJourney
from .domain_platform import Mover
from .moving_tracking_health import TRACKING_HEALTHY_AFTER_SECONDS, tracking_health


def tracking_group_name(booking_id):
    return f"tracking_{hashlib.sha256(str(booking_id).encode()).hexdigest()[:40]}"


class MovingTrackingConsumer(AsyncJsonWebsocketConsumer):
    PRESENCE_TTL_SECONDS = 15

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
        self.is_assigned_mover = await self._is_assigned_mover()
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

        if self.is_assigned_mover:
            await self._set_mover_presence(True)

        latest, health = await self._tracking_snapshot()
        phase = await self._phase()
        mover_connected = await self._mover_is_connected()
        await self.send_json({
            "type": "ready",
            "booking_id": str(self.booking_id),
            "location": latest,
            "phase": phase,
            "tracking_health": health,
            "mover_connected": mover_connected,
        })
        if self.is_assigned_mover:
            await self._broadcast_mover_connection(True)
        self.heartbeat_task = asyncio.create_task(self._heartbeat())

    async def disconnect(self, close_code):
        heartbeat = getattr(self, "heartbeat_task", None)
        if heartbeat is not None:
            heartbeat.cancel()
        if getattr(self, "is_assigned_mover", False) and hasattr(self, "group_name"):
            await self._set_mover_presence(False)
            await self._broadcast_mover_connection(await self._mover_is_connected())
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def _heartbeat(self):
        try:
            while True:
                await asyncio.sleep(5)
                if self.is_assigned_mover:
                    await self._set_mover_presence(True)
                health = await self._current_tracking_health()
                mover_connected = await self._mover_is_connected()
                await self.send_json({
                    "type": "tracking_health",
                    "tracking_health": health,
                    "mover_connected": mover_connected,
                })
                if self.is_assigned_mover:
                    await self._broadcast_mover_connection(mover_connected)
        except (asyncio.CancelledError, RuntimeError):
            return

    async def _mover_presence_client(self):
        redis_url = getattr(settings, "REDIS_URL", "")
        if not redis_url:
            return None
        return Redis.from_url(redis_url, decode_responses=True)

    def _mover_presence_key(self):
        return f"sakakrib:mover-presence:{self.booking_id}"

    async def _set_mover_presence(self, connected):
        client = await self._mover_presence_client()
        if client is None:
            return
        try:
            key = self._mover_presence_key()
            if connected:
                await client.sadd(key, self.channel_name)
                await client.expire(key, self.PRESENCE_TTL_SECONDS)
            else:
                await client.srem(key, self.channel_name)
                if await client.scard(key):
                    await client.expire(key, self.PRESENCE_TTL_SECONDS)
                else:
                    await client.delete(key)
        finally:
            await client.aclose()

    async def _mover_is_connected(self):
        client = await self._mover_presence_client()
        if client is None:
            return False
        try:
            return bool(await client.exists(self._mover_presence_key()))
        finally:
            await client.aclose()

    async def _broadcast_mover_connection(self, connected):
        health = await self._current_tracking_health()
        if connected:
            health = {
                **health,
                "status": "HEALTHY",
                "is_live": True,
                "age_seconds": 0,
            }
        else:
            health = {
                **health,
                "status": "OFFLINE",
                "is_live": False,
            }
        await self.channel_layer.group_send(
            self.group_name,
            {
                "type": "mover.tracking_health",
                "tracking_health": health,
                "mover_connected": connected,
                "changed_at": timezone.now().isoformat(),
            },
        )

    async def receive_json(self, content, **kwargs):
        # GPS writes stay on the authenticated HTTPS endpoint so Django's
        # CSRF/authentication and server-side throttling remain authoritative.
        if isinstance(content, dict) and content.get("type") == "ping":
            await self.send_json({"type": "pong"})
            return
        await self.send_json({"type": "info", "detail": "Send GPS updates through the tracking API."})

    async def moving_location(self, event):
        await self.send_json({
            "type": "location",
            "booking_id": str(self.booking_id),
            "location": event["location"],
            "tracking_health": event.get("tracking_health"),
        })

    async def moving_phase(self, event):
        await self.send_json({
            "type": "phase",
            "booking_id": str(self.booking_id),
            "phase": event["phase"],
            "changed_at": event["changed_at"],
        })

    async def mover_tracking_health(self, event):
        await self.send_json({
            "type": "tracking_health",
            "tracking_health": event.get("tracking_health"),
            "mover_connected": bool(event.get("mover_connected")),
            "changed_at": event.get("changed_at") or timezone.now().isoformat(),
        })

    @database_sync_to_async
    def _authorized(self):
        booking = Booking.objects.filter(pk=self.booking_id).first()
        if not booking:
            return False
        if booking.renter_id == self.user.pk:
            return True
        return Mover.objects.filter(pk=booking.mover_id, user_id=self.user.pk).exists()

    @database_sync_to_async
    def _is_assigned_mover(self):
        booking = Booking.objects.filter(pk=self.booking_id).first()
        return bool(booking and Mover.objects.filter(pk=booking.mover_id, user_id=self.user.pk).exists())

    @database_sync_to_async
    def _tracking_snapshot(self):
        point = MovingTrackingPoint.objects.filter(booking_id=self.booking_id).order_by("-recorded_at").first()
        now = timezone.now()
        recent_cutoff = now - timezone.timedelta(seconds=TRACKING_HEALTHY_AFTER_SECONDS)
        recent_point_count = MovingTrackingPoint.objects.filter(booking_id=self.booking_id, recorded_at__gte=recent_cutoff).count()
        if not point:
            return None, tracking_health(None, recent_point_count=recent_point_count, now=now)
        latest = {
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
        return latest, tracking_health(point.recorded_at, recent_point_count=recent_point_count, now=now)

    @database_sync_to_async
    def _current_tracking_health(self):
        point = MovingTrackingPoint.objects.filter(booking_id=self.booking_id).order_by("-recorded_at").first()
        now = timezone.now()
        recent_cutoff = now - timezone.timedelta(seconds=TRACKING_HEALTHY_AFTER_SECONDS)
        recent_point_count = MovingTrackingPoint.objects.filter(booking_id=self.booking_id, recorded_at__gte=recent_cutoff).count()
        return tracking_health(point.recorded_at if point else None, recent_point_count=recent_point_count, now=now)

    @database_sync_to_async
    def _phase(self):
        journey = MovingJourney.objects.filter(booking_id=self.booking_id).first()
        return journey.phase if journey else JOURNEY_PHASE_HEADING_TO_PICKUP
