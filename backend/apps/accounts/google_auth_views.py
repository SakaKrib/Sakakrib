import logging

from django.utils import timezone
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status
from rest_framework.views import APIView

from apps.core.email_services import queue_email

from .google_auth import authenticate_google_credential
from .jwt_service import issue_token_pair, set_auth_cookies
from .serializers import ProfileSerializer

logger = logging.getLogger(__name__)


class GoogleLoginView(APIView):
    """Exchange a verified Google Identity Services credential for SakaKrib JWT cookies."""

    permission_classes = [AllowAny]

    def post(self, request):
        credential = request.data.get('credential') or request.data.get('id_token')
        if not credential or not isinstance(credential, str):
            return Response(
                {'error': 'Google credential is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = authenticate_google_credential(credential.strip())
        access, refresh = issue_token_pair(user)
        response = Response(
            {
                'success': True,
                'authenticated': True,
                'user': {'id': str(user.id), 'email': user.email},
                'profile': ProfileSerializer(user).data,
            },
            status=status.HTTP_200_OK,
        )
        set_auth_cookies(response, access, refresh)

        # Keep security notifications on the Django authentication boundary so
        # every successful login method uses the same server-side email queue.
        try:
            queue_email(
                recipient=user.email,
                template_type='sign_in_notification',
                payload={
                    'email': user.email,
                    'full_name': user.full_name,
                    'sign_in_time': timezone.localtime().strftime('%d %b %Y, %H:%M %Z'),
                    'device': request.META.get('HTTP_USER_AGENT', 'Unknown device')[:255],
                    'location': request.META.get('REMOTE_ADDR', 'Unknown location'),
                    'security_url': 'https://sakakrib.com',
                },
            )
        except Exception:
            logger.exception('Failed to queue Google sign-in notification for %s', user.email)

        return response
