from django.core import signing
from django.core.files.storage import default_storage
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .authorization import is_admin

KYC_SIGNING_SALT = 'sakakrib.kyc-document'
KYC_SIGNING_MAX_AGE = 900
ALLOWED_BUCKETS = {'id-documents', 'licenses', 'kyc-documents'}


def _owned_path(user_id, path):
    return isinstance(path, str) and path.startswith(f'kyc-documents/{user_id}/') and '..' not in path.split('/')


class KycDocumentSignView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        bucket = str(request.data.get('bucket') or 'kyc-documents')
        path = str(request.data.get('path') or '').strip()
        if bucket not in ALLOWED_BUCKETS:
            return Response({'detail': 'Unsupported document storage bucket.'}, status=400)
        if not path:
            return Response({'detail': 'Document path is required.'}, status=400)

        requester_is_admin = is_admin(request.user)
        if bucket == 'kyc-documents':
            if not (_owned_path(request.user.pk, path) or requester_is_admin):
                return Response({'detail': 'You do not have access to this document.'}, status=403)
        elif not requester_is_admin:
            return Response({'detail': 'Administrator access is required for this document.'}, status=403)

        if not default_storage.exists(path):
            return Response({'detail': 'Document not found.'}, status=404)

        token = signing.dumps(
            {
                'path': path,
                'user_id': str(request.user.pk),
                'admin': requester_is_admin,
            },
            salt=KYC_SIGNING_SALT,
        )
        return Response({'url': request.build_absolute_uri(f'/api/accounts/kyc/document/{token}/')})
