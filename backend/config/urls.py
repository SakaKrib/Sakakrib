from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path
from django.conf import settings
from django.conf.urls.static import static


def health(_request):
    return JsonResponse({'status': 'ok', 'service': 'sakakrib-django'})


urlpatterns = [
    path('admin/', admin.site.urls),
    path('health/', health, name='health'),
    path('api/accounts/', include('apps.accounts.urls')),
    path('api/listings/', include('apps.listings.urls')),
    path('api/subscriptions/', include('apps.subscriptions.urls')),
    path('api/payments/', include('apps.payments.urls')),
    path('api/core/', include('apps.core.urls')),
]


if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)