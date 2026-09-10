import uuid
from pathlib import Path

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.files.storage import default_storage

MAX_COMMUNITY_IMAGE_BYTES = 8 * 1024 * 1024
MAX_COMMUNITY_IMAGES = 4
ALLOWED_COMMUNITY_IMAGE_TYPES = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
}


def community_media_url(media_id):
    base = getattr(settings, 'DJANGO_API_PUBLIC_URL', '').rstrip('/')
    return f'{base}/api/core/community-posts/media/{media_id}/' if base else f'/api/core/community-posts/media/{media_id}/'


def store_community_image(*, user_id, post_id, file, position):
    if not file:
        raise ValidationError('Image file is required.')
    content_type = str(getattr(file, 'content_type', '') or '').lower()
    if content_type not in ALLOWED_COMMUNITY_IMAGE_TYPES:
        raise ValidationError('Only JPG, PNG, WEBP, and GIF pictures are allowed.')
    size = int(getattr(file, 'size', 0) or 0)
    if size <= 0 or size > MAX_COMMUNITY_IMAGE_BYTES:
        raise ValidationError('Community pictures must be smaller than 8 MB.')
    extension = ALLOWED_COMMUNITY_IMAGE_TYPES[content_type]
    path = f'community-attachments/{user_id}/{post_id}/{uuid.uuid4().hex}{extension}'
    saved_path = default_storage.save(path, file)
    name = Path(getattr(file, 'name', 'image') or 'image').name
    return {
        'storage_path': saved_path,
        'name': name,
        'mime_type': content_type,
        'size': size,
        'position': position,
    }
