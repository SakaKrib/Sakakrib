from django.urls import path

from .views import CsrfTokenView, LoginView, LogoutView, MeView, RefreshView, SessionView, SetRoleView, SignupView, VerifyOtpView

urlpatterns = [
    path('csrf/', CsrfTokenView.as_view(), name='csrf'),
    path('signup/', SignupView.as_view(), name='signup'),
    path('login/', LoginView.as_view(), name='login'),
    path('verify-otp/', VerifyOtpView.as_view(), name='verify-otp'),
    path('refresh/', RefreshView.as_view(), name='refresh'),
    path('session/', SessionView.as_view(), name='session'),
    path('set-role/', SetRoleView.as_view(), name='set-role'),
    path('logout/', LogoutView.as_view(), name='logout'),
    path('me/', MeView.as_view(), name='me'),
]
