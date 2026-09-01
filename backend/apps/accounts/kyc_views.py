import uuid
from pathlib import Path

from django.core import signing
from django.core.files.storage import default_storage
from django.db import transaction
from django.http import FileResponse
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .authorization import is_admin
from .models import Profile

MAX_KYC_IMAGE_BYTES = 10 * 1024 * 1024
ALLOWED_KYC_TYPES = {'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp'}
KYC_SIGNING_SALT = 'sakakrib.kyc-document'
KYC_SIGNING_MAX_AGE = 900


def _owned_path(user_id, path):
    return isinstance(path, str) and path.startswith(f'kyc-documents/{user_id}/') and '..' not in Path(path).parts


def _signed_url(request, path):
    token = signing.dumps({'path': path, 'user_id': str(request.user.pk), 'admin': is_admin(request.user)}, salt=KYC_SIGNING_SALT)
    return request.build_absolute_uri(f'/api/accounts/kyc/document/{token}/')


class KycDocumentUploadView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        document_type = str(request.data.get('type') or '').lower()
        if document_type not in {'id', 'selfie'}:
            return Response({'detail': 'Document type must be id or selfie.'}, status=400)
        file = request.FILES.get('file')
        if not file:
            return Response({'detail': 'Image file is required.'}, status=400)
        content_type = str(getattr(file, 'content_type', '') or '').lower()
        if content_type not in ALLOWED_KYC_TYPES:
            return Response({'detail': 'Only JPG, PNG, or WebP images are allowed.'}, status=400)
        size = int(getattr(file, 'size', 0) or 0)
        if size <= 0 or size > MAX_KYC_IMAGE_BYTES:
            return Response({'detail': 'Image is too large. Maximum size is 10 MB.'}, status=400)
        path = f'kyc-documents/{request.user.pk}/{document_type}-{uuid.uuid4().hex}{ALLOWED_KYC_TYPES[content_type]}'
        saved_path = default_storage.save(path, file)
        return Response({'path': saved_path, 'document_type': document_type, 'size': size, 'mime_type': content_type}, status=201)


class KycDocumentVerifyView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        path = request.data.get('path')
        label = str(request.data.get('label') or 'document')
        if not _owned_path(request.user.pk, path):
            return Response({'detail': f'The uploaded {label} is invalid.'}, status=400)
        if not default_storage.exists(path):
            return Response({'detail': f'The uploaded {label} could not be verified.'}, status=404)
        return Response({'verified': True, 'path': path, 'url': _signed_url(request, path)})


class KycSubmitView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        full_name = str(request.data.get('full_name') or '').strip()
        national_id = str(request.data.get('national_id') or '').strip()
        id_path = request.data.get('id_photo_url')
        selfie_path = request.data.get('selfie_url')
        if not full_name:
            return Response({'detail': 'Full name is required.'}, status=400)
        if not national_id.isdigit() or not 7 <= len(national_id) <= 8:
            return Response({'detail': 'National ID must contain 7-8 digits.'}, status=400)
        if not _owned_path(request.user.pk, id_path) or not default_storage.exists(id_path):
            return Response({'detail': 'The National ID document could not be verified.'}, status=400)
        if not _owned_path(request.user.pk, selfie_path) or not default_storage.exists(selfie_path):
            return Response({'detail': 'The selfie could not be verified.'}, status=400)
        user = Profile.objects.select_for_update().get(pk=request.user.pk)
        user.full_name = full_name
        user.national_id = national_id
        user.id_photo_url = id_path
        user.selfie_url = selfie_path
        user.id_document_url = id_path
        user.id_document_type = 'national_id'
        user.kyc_completed = True
        user.kyc_status = 'pending'
        user.verification_status = 'pending_verification'
        user.save(update_fields=['full_name', 'national_id', 'id_photo_url', 'selfie_url', 'id_document_url', 'id_document_type', 'kyc_completed', 'kyc_status', 'verification_status', 'updated_at'])
        return Response({'success': True, 'profile': {
            'id': str(user.id), 'full_name': user.full_name, 'national_id': user.national_id,
            'kyc_completed': user.kyc_completed, 'kyc_status': user.kyc_status,
            'verification_status': user.verification_status, 'id_photo_url': user.id_photo_url,
            'selfie_url': user.selfie_url,
        }})


class KycDocumentView(APIView):
    authentication_classes = []
    permission_classes = []

    def get(self, request, token):
        try:
            payload = signing.loads(token, salt=KYC_SIGNING_SALT, max_age=KYC_SIGNING_MAX_AGE)
        except signing.BadSignature:
            return Response({'detail': 'Invalid or expired KYC document URL.'}, status=404)
        path = payload.get('path')
        user_id = payload.get('user_id')
        admin_access = bool(payload.get('admin'))
        authorized_path = admin_access or _owned_path(user_id, path)
        if not path or not user_id or not authorized_path or not default_storage.exists(path):
            return Response({'detail': 'Document not found.'}, status=404)
        file_obj = default_storage.open(path, 'rb')
        extension = path.rsplit('.', 1)[-1].lower() if '.' in path else ''
        content_type = {'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'webp': 'image/webp'}.get(extension, 'application/octet-stream')
        response = FileResponse(file_obj, content_type=content_type)
        response['Content-Disposition'] = 'inline'
        response['Cache-Control'] = 'private, max-age=300'
        return response
