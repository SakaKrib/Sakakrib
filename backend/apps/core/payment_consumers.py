import uuid

from channels.generic.websocket import AsyncJsonWebsocketConsumer

from .payment_events import payment_group_name


class PaymentStatusConsumer(AsyncJsonWebsocketConsumer):
    """Authenticated, invoice-scoped WebSocket for payment status updates."""

    async def connect(self):
        self.user = self.scope.get("user")
        invoice_id = self.scope["url_route"]["kwargs"].get("invoice_id", "")
        try:
            self.invoice_id = str(uuid.UUID(str(invoice_id)))
        except (ValueError, TypeError, AttributeError):
            await self.close(code=4400)
            return

        if not self.user or not getattr(self.user, "is_active", False):
            await self.close(code=4403)
            return

        self.group_name = payment_group_name(self.user.pk, self.invoice_id)
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        await self.send_json({"type": "ready", "invoice_id": self.invoice_id})

    async def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def payment_status(self, event):
        await self.send_json({
            "type": "payment_status",
            "status": event.get("status"),
            "message": event.get("message"),
            "provider": event.get("provider"),
            "invoice_id": event.get("invoice_id"),
            "event_type": event.get("event_type"),
            "listing_id": event.get("listing_id"),
            "subscription_id": event.get("subscription_id"),
            "subscription_status": event.get("subscription_status"),
            "details": event.get("details") or {},
        })
