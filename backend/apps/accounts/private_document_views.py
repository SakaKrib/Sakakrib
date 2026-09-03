import uuid
from pathlib import Path

from django.core.files.storage import default_storage
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .authorization import is_admin

MAX_DOCUMENT_BYTES = 10 * 1024 * 1024
ALLOWED_BUCKETS = {'id-documents', 'licenses', 'kyc-documents'}
ALLOWED_CONTENT_TYPES = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'application/pdf': '.pdf',
}


class PrivateDocumentUploadView(APIView):
    """Store applicant-owned private documents through Django storage."""

    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        bucket = str(request.data.get('bucket') or '').strip()
        if bucket not in ALLOWED_BUCKETS:
            return Response({'detail': 'Unsupported document storage bucket.'}, status=400)

        file = request.FILES.get('file')
        if not file:
            return Response({'detail': 'Document file is required.'}, status=400)

        content_type = str(getattr(file, 'content_type', '') or '').lower()
        if content_type not in ALLOWED_CONTENT_TYPES:
            return Response({'detail': 'Only JPG, PNG, WebP, or PDF documents are allowed.'}, status=400)

        size = int(getattr(file, 'size', 0) or 0)
        if size <= 0 or size > MAX_DOCUMENT_BYTES:
            return Response({'detail': 'Document is too large. Maximum size is 10 MB.'}, status=400)

        original_name = Path(str(getattr(file, 'name', '') or 'document')).name
        stem = ''.join(ch for ch in Path(original_name).stem if ch.isalnum() or ch in {'-', '_'})[:80] or 'document'
        extension = ALLOWED_CONTENT_TYPES[content_type]
        path = f'{bucket}/{request.user.pk}/{stem}-{uuid.uuid4().hex}{extension}'

        saved_path = default_storage.save(path, file)
        return Response({
            'path': saved_path,
            'bucket': bucket,
            'size': size,
            'mime_type': content_type,
        }, status=201)
