from django.urls import path

from .views import (MpesaSubscriptionCallbackView, MySubscriptionAccessView,
                    MySubscriptionView, SubscriptionCheckoutView, SubscriptionPlansView)

urlpatterns = [
    path('plans/', SubscriptionPlansView.as_view(), name='subscription-plans'),
    path('me/', MySubscriptionView.as_view(), name='my-subscription'),
    path('me/access/', MySubscriptionAccessView.as_view(), name='my-subscription-access'),
    path('checkout/', SubscriptionCheckoutView.as_view(), name='subscription-checkout'),
    path('callbacks/mpesa/', MpesaSubscriptionCallbackView.as_view(), name='mpesa-subscription-callback'),
]
