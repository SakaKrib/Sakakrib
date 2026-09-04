from django.urls import path

from .admin_application_notification_views import AdminApplicationNotificationView
from .admin_application_status_views import AdminApplicationStatusView
from .admin_user_views import AdminDashboardDataView, AdminUserDetailView, AdminUserMoverApplicationView
from .google_auth_views import GoogleLoginView
from .kyc_views import KycDocumentUploadView, KycDocumentVerifyView, KycSubmitView
from .kyc_storage_views import KycDocumentSignView
from .landlord_application_views import LandlordApplicationSubmitView
from .mover_application_views import MoverApplicationSubmitView
from .password_reset_views import PasswordResetConfirmView, PasswordResetRequestView
from .private_document_views import PrivateDocumentUploadView, PrivateDocumentView
from .profile_media_views import ProfilePhotoView
from .views import CsrfTokenView, LoginView, LogoutView, MeView, RefreshView, ResendOtpView, SessionView, SetRoleView, SignupView, VerifyOtpView

urlpatterns = [
    path('csrf/', CsrfTokenView.as_view(), name='csrf'),
    path('signup/', SignupView.as_view(), name='signup'),
    path('login/', LoginView.as_view(), name='login'),
    path('google/', GoogleLoginView.as_view(), name='google-login'),
    path('verify-otp/', VerifyOtpView.as_view(), name='verify-otp'),
    path('resend-otp/', ResendOtpView.as_view(), name='resend-otp'),
    path('refresh/', RefreshView.as_view(), name='refresh'),
    path('session/', SessionView.as_view(), name='session'),
    path('set-role/', SetRoleView.as_view(), name='set-role'),
    path('logout/', LogoutView.as_view(), name='logout'),
    path('me/', MeView.as_view(), name='me'),
    path('password-reset/', PasswordResetRequestView.as_view(), name='password-reset-request'),
    path('password-reset/confirm/', PasswordResetConfirmView.as_view(), name='password-reset-confirm'),
    path('profile-photo/', ProfilePhotoView.as_view(), name='profile-photo-upload'),
    path('profile-photo/<uuid:user_id>/', ProfilePhotoView.as_view(), name='profile-photo'),
    path('documents/upload/', PrivateDocumentUploadView.as_view(), name='private-document-upload'),
    path('documents/view/', PrivateDocumentView.as_view(), name='private-document-view'),
    path('kyc/upload/', KycDocumentUploadView.as_view(), name='kyc-upload'),
    path('kyc/verify/', KycDocumentVerifyView.as_view(), name='kyc-verify'),
    path('kyc/submit/', KycSubmitView.as_view(), name='kyc-submit'),
    path('kyc/document/sign/', KycDocumentSignView.as_view(), name='kyc-document-sign'),
    path('landlord/application/submit/', LandlordApplicationSubmitView.as_view(), name='landlord-application-submit'),
    path('mover/application/submit/', MoverApplicationSubmitView.as_view(), name='mover-application-submit'),
    path('admin/users/', AdminDashboardDataView.as_view(), name='admin-users'),
    path('admin/users/<uuid:user_id>/', AdminUserDetailView.as_view(), name='admin-user-detail'),
    path('admin/users/<uuid:user_id>/application-status/', AdminApplicationStatusView.as_view(), name='admin-application-status'),
    path('admin/users/<uuid:user_id>/mover-application/', AdminUserMoverApplicationView.as_view(), name='admin-user-mover-application'),
    path('admin/application-notifications/', AdminApplicationNotificationView.as_view(), name='admin-application-notification'),
]
