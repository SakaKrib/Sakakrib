from django.http import JsonResponse
from django.urls import include, path


def health(_request):
    return JsonResponse({'status': 'ok', 'service': 'sakakrib-django'})


urlpatterns = [
    path('health/', health, name='health'),
    path('api/accounts/', include('apps.accounts.urls')),
    path('api/listings/', include('apps.listings.urls')),
    path('api/subscriptions/', include('apps.subscriptions.urls')),
    path('api/payments/', include('apps.payments.urls')),
]
