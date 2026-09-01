from django.core.exceptions import ValidationError
from django.db import transaction

from apps.accounts.models import Profile

from .domain_bookings import ChatMessage
from .domain_platform import Mover
from .notification_services import dispatch_user_notification


MESSAGE_TYPES = {
    "text", "image", "booking_request", "booking_response", "schedule_proposed",
    "schedule_confirmed", "event_request", "event_confirmed", "event_declined", "system",
}


def conversation_id_for_users(first_id, second_id):
    values = sorted((str(first_id), str(second_id)))
    return f"{values[0]}__{values[1]}"


def _participant_pair(sender_id, receiver_id):
    sender = Profile.objects.filter(pk=sender_id, is_active=True).first()
    receiver = Profile.objects.filter(pk=receiver_id, is_active=True).first()
    if not sender or not receiver:
        raise ValidationError("Chat participant not found")

    sender_mover = Mover.objects.filter(user_id=sender_id, approval_status="approved").exists()
    receiver_mover = Mover.objects.filter(user_id=receiver_id, approval_status="approved").exists()
    valid = (sender.role == "renter" and receiver_mover) or (sender_mover and receiver.role == "renter")
    if not valid:
        raise ValidationError("Chat is only available between a renter and an approved mover")


def list_conversation(*, user_id, conversation_id, limit=50, before=None):
    parts = str(conversation_id).split("__")
    if len(parts) != 2 or str(user_id) not in parts:
        raise ValidationError("Unauthorized conversation")
    try:
        expected = conversation_id_for_users(parts[0], parts[1])
    except Exception as exc:
        raise ValidationError("Invalid conversation id") from exc
    if expected != str(conversation_id):
        raise ValidationError("Invalid conversation id")

    qs = ChatMessage.objects.filter(conversation_id=conversation_id).order_by("-created_at", "-id")
    if before:
        qs = qs.filter(created_at__lt=before)
    rows = list(qs[: max(1, min(int(limit), 100))])
    rows.reverse()
    return rows


@transaction.atomic
def send_message(*, sender_id, receiver_id, content="", message_type="text", event_data=None):
    if message_type not in MESSAGE_TYPES:
        raise ValidationError("Invalid message type")
    _participant_pair(sender_id, receiver_id)
    text = str(content or "")
    if message_type == "text" and not text.strip():
        raise ValidationError("Message content is required")
    if len(text) > 10000:
        raise ValidationError("Message content is too long")

    conversation_id = conversation_id_for_users(sender_id, receiver_id)
    message = ChatMessage.objects.create(
        conversation_id=conversation_id,
        sender_id=sender_id,
        receiver_id=receiver_id,
        content=text,
        message_type=message_type,
        event_data=event_data if isinstance(event_data, dict) else None,
    )
    dispatch_user_notification(
        user_id=receiver_id,
        notification_type="CHAT_MESSAGE",
        title="New message",
        message=text[:160] if text else "You received a new message.",
        data={"conversation_id": conversation_id, "message_id": str(message.id), "message_type": message_type},
        event_key=f"chat:{message.id}",
        send_email=False,
    )
    return message


def serialize_message(message):
    return {
        "id": str(message.id),
        "conversation_id": message.conversation_id,
        "sender_id": str(message.sender_id),
        "receiver_id": str(message.receiver_id),
        "content": message.content,
        "message_type": message.message_type,
        "event_data": message.event_data,
        "created_at": message.created_at.isoformat(),
    }
