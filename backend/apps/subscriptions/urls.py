from django.urls import path

from .views import MySubscriptionAccessView, MySubscriptionView, SubscriptionPlansView

urlpatterns = [
    path('plans/', SubscriptionPlansView.as_view(), name='subscription-plans'),
    path('me/', MySubscriptionView.as_view(), name='my-subscription'),
    path('me/access/', MySubscriptionAccessView.as_view(), name='my-subscription-access'),
]
