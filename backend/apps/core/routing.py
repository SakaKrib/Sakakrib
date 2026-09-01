from django.urls import re_path

from .chat_consumers import MovingChatConsumer

websocket_urlpatterns = [
    re_path(r"^ws/chat/(?P<conversation_id>[0-9a-fA-F-]+__[0-9a-fA-F-]+?)/$", MovingChatConsumer.as_asgi()),
]
