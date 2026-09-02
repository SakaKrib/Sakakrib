from django.urls import path

from .admin_application_status_views import AdminApplicationStatusView
from .admin_mover_views import AdminMoverDetailView
from .admin_user_views import AdminUserDetailView, AdminUserMoverView
from .application_review_views import AdminApplicationReviewView
from .kyc_views import KycDocumentUploadView, KycDocumentVerifyView, KycDocumentView, KycSubmitView
from .kyc_storage_views import KycDocumentSignView
from .views import CsrfTokenView, LoginView, LogoutView, MeView, RefreshView, ResendOtpView, SessionView, SetRoleView, SignupView, VerifyOtpView

urlpatterns = [
    path('csrf/', CsrfTokenView.as_view(), name='csrf'),
    path('signup/', SignupView.as_view(), name='signup'),
    path('login/', LoginView.as_view(), name='login'),
    path('verify-otp/', VerifyOtpView.as_view(), name='verify-otp'),
    path('resend-otp/', ResendOtpView.as_view(), name='resend-otp'),
    path('refresh/', RefreshView.as_view(), name='refresh'),
    path('session/', SessionView.as_view(), name='session'),
    path('set-role/', SetRoleView.as_view(), name='set-role'),
    path('logout/', LogoutView.as_view(), name='logout'),
    path('me/', MeView.as_view(), name='me'),
    path('kyc/upload/', KycDocumentUploadView.as_view(), name='kyc-upload'),
    path('kyc/verify/', KycDocumentVerifyView.as_view(), name='kyc-verify'),
    path('kyc/submit/', KycSubmitView.as_view(), name='kyc-submit'),
    path('kyc/document/sign/', KycDocumentSignView.as_view(), name='kyc-document-sign'),
    path('kyc/document/<str:token>/', KycDocumentView.as_view(), name='kyc-document'),
    path('admin/applications/<uuid:user_id>/review/', AdminApplicationReviewView.as_view(), name='admin-application-review'),
    path('admin/users/<uuid:user_id>/', AdminUserDetailView.as_view(), name='admin-user-detail'),
    path('admin/users/<uuid:user_id>/application-status/', AdminApplicationStatusView.as_view(), name='admin-application-status'),
    path('admin/movers/<uuid:mover_id>/', AdminUserMoverView.as_view(), name='admin-user-mover'),
    path('admin/mover-details/<uuid:mover_id>/', AdminMoverDetailView.as_view(), name='admin-mover-detail'),
]
