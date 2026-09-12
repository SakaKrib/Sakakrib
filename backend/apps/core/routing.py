from django.urls import re_path

from .chat_consumers import MovingChatConsumer, MovingChatInboxConsumer
from .moving_tracking_consumers import MovingTrackingConsumer
from .payment_consumers import PaymentStatusConsumer, SubscriptionInvoiceHistoryConsumer

websocket_urlpatterns = [
    re_path(r"^ws/chat/inbox/$", MovingChatInboxConsumer.as_asgi()),
    re_path(r"^ws/chat/(?P<conversation_id>[0-9a-fA-F-]+__[0-9a-fA-F-]+?)/$", MovingChatConsumer.as_asgi()),
    re_path(r"^ws/tracking/(?P<booking_id>[0-9a-fA-F-]+)/$", MovingTrackingConsumer.as_asgi()),
    re_path(r"^ws/payments/(?P<invoice_id>[0-9a-fA-F-]+)/$", PaymentStatusConsumer.as_asgi()),
    re_path(r"^ws/subscription-invoices/$", SubscriptionInvoiceHistoryConsumer.as_asgi()),
]
