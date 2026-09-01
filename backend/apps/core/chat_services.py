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
    if not sender_id or not receiver_id or str(sender_id) == str(receiver_id):
        raise ValidationError("A valid renter and mover are required")

    sender = Profile.objects.filter(pk=sender_id, is_active=True).first()
    receiver = Profile.objects.filter(pk=receiver_id, is_active=True).first()
    if not sender or not receiver:
        raise ValidationError("Chat participant not found")

    sender_mover = Mover.objects.filter(
        user_id=sender_id,
        approval_status="approved",
    ).exists()
    receiver_mover = Mover.objects.filter(
        user_id=receiver_id,
        approval_status="approved",
    ).exists()
    valid = (
        (sender.role == "renter" and receiver_mover)
        or (sender_mover and receiver.role == "renter")
    )
    if not valid:
        raise ValidationError(
            "Chat is only available between a renter and an approved mover"
        )


def validate_conversation_for_user(*, user_id, conversation_id):
    parts = str(conversation_id or "").split("__")
    if len(parts) != 2 or not all(parts):
        raise ValidationError("Invalid conversation id")
    if str(user_id) not in parts:
        raise ValidationError("Unauthorized conversation")
    expected = conversation_id_for_users(parts[0], parts[1])
    if expected != str(conversation_id):
        raise ValidationError("Invalid conversation id")
    other_id = parts[1] if parts[0] == str(user_id) else parts[0]
    _participant_pair(user_id, other_id)
    return other_id


def list_conversation(*, user_id, conversation_id, limit=50, before=None):
    validate_conversation_for_user(
        user_id=user_id,
        conversation_id=conversation_id,
    )

    try:
        safe_limit = max(1, min(int(limit), 100))
    except (TypeError, ValueError) as exc:
        raise ValidationError("Invalid message limit") from exc

    qs = ChatMessage.objects.filter(
        conversation_id=conversation_id,
    ).order_by("-created_at", "-id")
    if before:
        qs = qs.filter(created_at__lt=before)
    rows = list(qs[:safe_limit])
    rows.reverse()
    return rows


@transaction.atomic
def send_message(*, sender_id, receiver_id, content="", message_type="text", event_data=None):
    if message_type not in MESSAGE_TYPES:
        raise ValidationError("Invalid message type")
    _participant_pair(sender_id, receiver_id)

    text = str(content or "")
    if message_type in {"text", "booking_request", "booking_response", "schedule_proposed", "schedule_confirmed", "event_request", "event_confirmed", "event_declined", "system"} and not text.strip():
        raise ValidationError("Message content is required")
    if len(text) > 10000:
        raise ValidationError("Message content is too long")

    normalized_event_data = event_data if isinstance(event_data, dict) else None
    conversation_id = conversation_id_for_users(sender_id, receiver_id)
    message = ChatMessage.objects.create(
        conversation_id=conversation_id,
        sender_id=sender_id,
        receiver_id=receiver_id,
        content=text,
        message_type=message_type,
        event_data=normalized_event_data,
    )

    dispatch_user_notification(
        user_id=receiver_id,
        notification_type="CHAT_MESSAGE",
        title="New message",
        message=text[:160] if text else "You received a new message.",
        data={
            "conversation_id": conversation_id,
            "message_id": str(message.id),
            "message_type": message_type,
        },
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
