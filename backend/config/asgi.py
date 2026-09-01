import os

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter

from apps.core.routing import websocket_urlpatterns
from apps.core.ws_auth import CookieJWTWebSocketMiddleware


django_application = get_asgi_application()

application = ProtocolTypeRouter({
    'http': django_application,
    'websocket': CookieJWTWebSocketMiddleware(
        URLRouter(websocket_urlpatterns)
    ),
})
