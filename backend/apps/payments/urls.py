from django.urls import path
from .views import PaymentProviderConfigView

urlpatterns = [
    path('providers/', PaymentProviderConfigView.as_view(), name='payment-providers'),
]
