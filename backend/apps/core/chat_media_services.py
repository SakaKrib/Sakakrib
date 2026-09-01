import mimetypes
import uuid
from pathlib import Path

from django.conf import settings
from django.core import signing
from django.core.exceptions import ValidationError
from django.core.files.storage import default_storage

from .domain_bookings import ChatMessage

MAX_IMAGE_BYTES = 8 * 1024 * 1024
ALLOWED_IMAGE_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}
SIGNING_SALT = "sakakrib.chat-attachment"
SIGNING_MAX_AGE = 3600


def _attachment_from_message(message):
    data = message.event_data if isinstance(message.event_data, dict) else {}
    attachments = data.get("attachments")
    if not isinstance(attachments, list) or not attachments:
        raise ValidationError("Chat attachment not found")
    item = attachments[0]
    if not isinstance(item, dict) or not isinstance(item.get("path"), str):
        raise ValidationError("Chat attachment is invalid")
    return item


def store_chat_image(*, message_id, conversation_id, file):
    if not file:
        raise ValidationError("Image file is required")
    content_type = str(getattr(file, "content_type", "") or "").lower()
    if content_type not in ALLOWED_IMAGE_TYPES:
        raise ValidationError("Only JPG, PNG, WEBP, and GIF pictures are allowed.")
    size = int(getattr(file, "size", 0) or 0)
    if size <= 0 or size > MAX_IMAGE_BYTES:
        raise ValidationError("Picture attachments must be smaller than 8 MB.")

    extension = ALLOWED_IMAGE_TYPES[content_type]
    path = f"chat-attachments/{conversation_id}/{message_id}-{uuid.uuid4().hex}{extension}"
    saved_path = default_storage.save(path, file)
    name = Path(getattr(file, "name", "image") or "image").name
    return {
        "path": saved_path,
        "name": name,
        "mime_type": content_type,
        "size": size,
    }


def sign_chat_attachment(*, message, user_id):
    if str(user_id) not in {str(message.sender_id), str(message.receiver_id)}:
        raise ValidationError("Unauthorized chat attachment")
    attachment = _attachment_from_message(message)
    payload = {"message_id": str(message.id), "path": attachment["path"]}
    token = signing.dumps(payload, salt=SIGNING_SALT)
    base = getattr(settings, "CHAT_ATTACHMENT_BASE_URL", "").rstrip("/")
    url = f"{base}/api/core/chat/media/{token}/"
    return url


def resolve_signed_attachment(token):
    try:
        payload = signing.loads(token, salt=SIGNING_SALT, max_age=SIGNING_MAX_AGE)
    except signing.BadSignature as exc:
        raise ValidationError("Invalid or expired attachment URL") from exc
    message = ChatMessage.objects.filter(pk=payload.get("message_id")).first()
    if not message:
        raise ValidationError("Chat message not found")
    attachment = _attachment_from_message(message)
    if attachment.get("path") != payload.get("path"):
        raise ValidationError("Attachment no longer matches the message")
    return message, attachment
