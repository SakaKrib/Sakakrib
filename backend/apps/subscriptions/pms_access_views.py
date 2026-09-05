from rest_framework.response import Response
from rest_framework.views import APIView

from .services import get_pms_access


class MyPMSAccessView(APIView):
    """Return the Django-authoritative decision for entering a PMS workspace."""

    def get(self, request):
        return Response(get_pms_access(request.user))
