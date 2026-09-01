from django.core.exceptions import ValidationError
from django.core.files.storage import default_storage
from django.http import FileResponse, JsonResponse
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView

from .chat_media_services import resolve_signed_attachment, sign_chat_attachment, store_chat_image
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
                signed_url = sign_chat_attachment(message=message, user_id=request.user.pk)
                return JsonResponse({"signed_url": signed_url}, status=200)

            if action != "upload":
                raise ValidationError("Invalid media action")
            conversation_id = str(request.data.get("conversation_id", ""))
            message_id = str(request.data.get("message_id", "")) or "pending"
            if not conversation_id:
                raise ValidationError("conversation_id is required")
            file = request.FILES.get("file")
            attachment = store_chat_image(
                message_id=message_id,
                conversation_id=conversation_id,
                file=file,
            )
            return JsonResponse(attachment, status=201)
        except (ValidationError, ValueError, TypeError) as exc:
            return _error(exc)


class ChatMediaFileView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, token):
        try:
            message, attachment = resolve_signed_attachment(token)
            if not default_storage.exists(attachment["path"]):
                return JsonResponse({"error": "Attachment not found"}, status=404)
            file_obj = default_storage.open(attachment["path"], "rb")
            response = FileResponse(file_obj, content_type=attachment.get("mime_type") or "application/octet-stream")
            response["Content-Disposition"] = "inline"
            response["Cache-Control"] = "private, max-age=300"
            return response
        except ValidationError as exc:
            return _error(exc)
