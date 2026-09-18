from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .google_auth import authenticate_google_credential
from .jwt_service import issue_token_pair, set_auth_cookies
from .serializers import ProfileSerializer


class GoogleCredentialSerializer(serializers.Serializer):
    credential = serializers.CharField(write_only=True, trim_whitespace=True)


class GoogleLoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = GoogleCredentialSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = authenticate_google_credential(serializer.validated_data['credential'])
        access, refresh = issue_token_pair(user)
        response = Response({
            'success': True,
            'authenticated': True,
            'user': {'id': str(user.id), 'email': user.email},
            'profile': ProfileSerializer(user).data,
        }, status=status.HTTP_200_OK)
        set_auth_cookies(response, access, refresh)
        return response
