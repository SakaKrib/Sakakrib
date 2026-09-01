from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import ProfileSerializer


class MeView(APIView):
    """Return the authenticated application's profile."""
    def get(self, request):
        return Response(ProfileSerializer(request.user.profile).data)
