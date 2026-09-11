from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path
from django.conf import settings
from django.conf.urls.static import static

from apps.core.property_rental_views import RenterPropertyUnitRequestView
from apps.core.property_rental_owner_views import PropertyRentalOwnerRequestView
from apps.core.moving_paypal_capture_views import MovingPaypalCaptureView


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
    path('api/core/bookings/<uuid:booking_id>/payment/paypal/capture/', MovingPaypalCaptureView.as_view(), name='moving-payment-paypal-capture'),
    path('api/core/property-rental/request/', RenterPropertyUnitRequestView.as_view(), name='property-rental-request'),
    path('api/core/property-rental/requests/', PropertyRentalOwnerRequestView.as_view(), name='property-rental-owner-requests'),
    path('api/core/property-rental/requests/<uuid:association_id>/', PropertyRentalOwnerRequestView.as_view(), name='property-rental-owner-request'),
]


if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)