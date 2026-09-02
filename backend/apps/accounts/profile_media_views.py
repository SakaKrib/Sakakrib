from pathlib import Path
import uuid

from django.core.files.storage import default_storage
from django.db import transaction
from django.http import FileResponse
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Profile


ALLOWED_IMAGE_TYPES = {'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp'}
MAX_PROFILE_PHOTO_BYTES = 5 * 1024 * 1024


def _storage_path(value):
    value = str(value or '')
    return value[len('django-media://'):].lstrip('/') if value.startswith('django-media://') else None


def _content_type(path):
    return {'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'webp': 'image/webp'}.get(path.rsplit('.', 1)[-1].lower(), 'application/octet-stream')


class ProfilePhotoView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def get(self, request, user_id):
        profile = Profile.objects.filter(pk=user_id).first()
        if not profile:
            return Response({'detail': 'Profile not found.'}, status=404)
        storage_path = _storage_path(profile.profile_photo_url)
        if not storage_path or not default_storage.exists(storage_path):
            return Response({'detail': 'Profile photo not found.'}, status=404)
        response = FileResponse(default_storage.open(storage_path, 'rb'), content_type=_content_type(storage_path))
        response['Content-Disposition'] = 'inline'
        response['Cache-Control'] = 'private, max-age=300'
        return response

    def post(self, request):
        file = request.FILES.get('file')
        if not file:
            return Response({'detail': 'Profile image is required.'}, status=400)
        content_type = str(getattr(file, 'content_type', '') or '').lower()
        if content_type not in ALLOWED_IMAGE_TYPES:
            return Response({'detail': 'Only JPG, PNG, and WebP images are supported.'}, status=400)
        if int(getattr(file, 'size', 0) or 0) <= 0 or int(file.size) > MAX_PROFILE_PHOTO_BYTES:
            return Response({'detail': 'Profile image must be 5 MB or smaller.'}, status=400)

        extension = ALLOWED_IMAGE_TYPES[content_type]
        stem = Path(getattr(file, 'name', '') or 'profile').stem
        safe_name = ''.join(char if char.isalnum() or char in '-_' else '-' for char in stem)
        safe_name = '-'.join(part for part in safe_name.split('-') if part)[:60] or 'profile'
        path = f'profile-photos/{request.user.pk}/{uuid.uuid4()}-{safe_name}{extension}'
        saved_path = default_storage.save(path, file)

        try:
            with transaction.atomic():
                profile = Profile.objects.select_for_update().get(pk=request.user.pk)
                old_path = _storage_path(profile.profile_photo_url)
                profile.profile_photo_url = f'django-media://{saved_path}'
                profile.save(update_fields=['profile_photo_url', 'updated_at'])
            if old_path and old_path != saved_path and default_storage.exists(old_path):
                default_storage.delete(old_path)
        except Exception:
            if default_storage.exists(saved_path):
                default_storage.delete(saved_path)
            raise

        return Response({'profile_photo_url': f'/api/accounts/profile-photo/{profile.id}/'})
