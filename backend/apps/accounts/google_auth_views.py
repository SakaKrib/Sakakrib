from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status
from rest_framework.views import APIView

from .google_auth import authenticate_google_credential
from .jwt_service import issue_token_pair, set_auth_cookies
from .serializers import ProfileSerializer


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
        return response
