from django.core.files.storage import default_storage
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .authorization import is_admin

ALLOWED_BUCKETS = {'id-documents', 'licenses', 'kyc-documents'}


class KycDocumentSignView(APIView):
    """Return an authenticated document URL without exposing a signing token."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        bucket = str(request.data.get('bucket') or 'kyc-documents').strip()
        path = str(request.data.get('path') or '').strip().lstrip('/')
        if bucket not in ALLOWED_BUCKETS:
            return Response({'detail': 'Unsupported document storage bucket.'}, status=400)
        if not path:
            return Response({'detail': 'Document path is required.'}, status=400)

        if path.startswith(f'{bucket}/'):
            normalized_path = path
        else:
            normalized_path = f'{bucket}/{path}'

        if '..' in normalized_path.split('/'):
            return Response({'detail': 'Invalid document path.'}, status=400)

        requester_is_admin = is_admin(request.user)
        if not requester_is_admin and not normalized_path.startswith(f'{bucket}/{request.user.pk}/'):
            return Response({'detail': 'You do not have access to this document.'}, status=403)

        if not default_storage.exists(normalized_path):
            return Response({'detail': 'Document not found.'}, status=404)

        return Response({
            'url': request.build_absolute_uri(
                f'/api/accounts/documents/view/?bucket={bucket}&path={normalized_path}'
            )
        })
