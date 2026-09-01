from django.core.exceptions import ValidationError
from django.core.files.storage import default_storage
from django.http import FileResponse, JsonResponse
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView

from .chat_media_services import resolve_signed_attachment, sign_chat_attachment, sign_chat_path, store_chat_image
from .chat_services import validate_conversation_for_user
from .domain_bookings import ChatMessage


def _error(exc):
    return JsonResponse({"error": str(exc)}, status=400)


class ChatMediaUploadView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        action = str(request.data.get("action", "upload")).lower()
        try:
            if action == "sign":
                message_id = request.data.get("message_id")
                message = ChatMessage.objects.filter(pk=message_id).first()
                if not message:
                    raise ValidationError("Chat message not found")
                return JsonResponse({"signed_url": sign_chat_attachment(message=message, user_id=request.user.pk)}, status=200)
            if action != "upload":
                raise ValidationError("Invalid media action")
            conversation_id = str(request.data.get("conversation_id", ""))
            if not conversation_id:
                raise ValidationError("conversation_id is required")
            validate_conversation_for_user(user_id=request.user.pk, conversation_id=conversation_id)
            attachment = store_chat_image(
                message_id=str(request.data.get("message_id", "pending")) or "pending",
                conversation_id=conversation_id,
                file=request.FILES.get("file"),
            )
            attachment["signed_url"] = sign_chat_path(path=attachment["path"], conversation_id=conversation_id)
            return JsonResponse(attachment, status=201)
        except (ValidationError, ValueError, TypeError) as exc:
            return _error(exc)


class ChatMediaFileView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, token):
        try:
            path = resolve_signed_attachment(token)
            if not default_storage.exists(path):
                return JsonResponse({"error": "Attachment not found"}, status=404)
            file_obj = default_storage.open(path, "rb")
            content_type = "application/octet-stream"
            name = path.rsplit("/", 1)[-1]
            if "." in name:
                extension = name.rsplit(".", 1)[-1].lower()
                content_type = {"jpg":"image/jpeg", "jpeg":"image/jpeg", "png":"image/png", "webp":"image/webp", "gif":"image/gif"}.get(extension, content_type)
            response = FileResponse(file_obj, content_type=content_type)
            response["Content-Disposition"] = "inline"
            response["Cache-Control"] = "private, max-age=300"
            return response
        except ValidationError as exc:
            return _error(exc)
