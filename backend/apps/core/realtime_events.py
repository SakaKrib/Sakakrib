import hashlib

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer


def user_event_group_name(user_id):
    digest = hashlib.sha256(str(user_id).encode()).hexdigest()[:40]
    return f"live_user_{digest}"


def publish_user_event(user_id, *, resource, object_id, action="updated", status=None):
    if not user_id:
        return
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return
    async_to_sync(channel_layer.group_send)(
        user_event_group_name(user_id),
        {
            "type": "live_event",
            "event": {
                "type": "resource.updated",
                "resource": resource,
                "object_id": str(object_id),
                "action": action,
                "status": str(status) if status is not None else None,
            },
        },
    )


def schedule_user_event(user_id, *, resource, object_id, action="updated", status=None):
    from django.db import transaction

    transaction.on_commit(
        lambda: publish_user_event(
            user_id,
            resource=resource,
            object_id=object_id,
            action=action,
            status=status,
        )
    )

def admin_event_group_name():
    return "live_admins"


def schedule_admin_event(*, resource, object_id, action="updated", status=None):
    from django.db import transaction

    def publish():
        channel_layer = get_channel_layer()
        if channel_layer is None:
            return
        async_to_sync(channel_layer.group_send)(
            admin_event_group_name(),
            {
                "type": "live_event",
                "event": {
                    "type": "resource.updated",
                    "resource": resource,
                    "object_id": str(object_id),
                    "action": action,
                    "status": str(status) if status is not None else None,
                },
            },
        )

    transaction.on_commit(publish)


def community_event_group_name():
    return "live_community_feed"


def schedule_community_event(*, object_id, action="updated", status=None):
    from django.db import transaction

    def publish():
        channel_layer = get_channel_layer()
        if channel_layer is None:
            return
        async_to_sync(channel_layer.group_send)(
            community_event_group_name(),
            {
                "type": "live_event",
                "event": {
                    "type": "resource.updated",
                    "resource": "community",
                    "object_id": str(object_id),
                    "action": action,
                    "status": str(status) if status is not None else None,
                },
            },
        )

    transaction.on_commit(publish)



def marketplace_event_group_name():
    return "live_public_marketplace"


def schedule_marketplace_event(*, resource, object_id, action="updated", status=None):
    """Broadcast public catalogue invalidations without exposing record content."""
    from django.db import transaction

    def publish():
        channel_layer = get_channel_layer()
        if channel_layer is None:
            return
        async_to_sync(channel_layer.group_send)(
            marketplace_event_group_name(),
            {
                "type": "live_event",
                "event": {
                    "type": "resource.updated",
                    "resource": str(resource),
                    "object_id": str(object_id),
                    "action": action,
                    "status": str(status) if status is not None else None,
                },
            },
        )

    transaction.on_commit(publish)



def publish_chat_message(message_id):
    """Broadcast every persisted chat message to its conversation and both inboxes."""
    import hashlib

    from .chat_services import serialize_message
    from .domain_bookings import ChatMessage

    message = ChatMessage.objects.filter(pk=message_id).first()
    if message is None:
        return

    channel_layer = get_channel_layer()
    if channel_layer is None:
        return

    serialized = serialize_message(message)
    conversation_digest = hashlib.sha256(
        message.conversation_id.encode()
    ).hexdigest()[:40]
    async_to_sync(channel_layer.group_send)(
        f"chat_{conversation_digest}",
        {"type": "chat.message", "message": serialized},
    )

    for user_id in {str(message.sender_id), str(message.receiver_id)}:
        user_digest = hashlib.sha256(user_id.encode()).hexdigest()[:40]
        async_to_sync(channel_layer.group_send)(
            f"chat_inbox_{user_digest}",
            {"type": "chat.inbox_message", "message": serialized},
        )


def schedule_chat_message_event(message_id):
    from django.db import transaction

    transaction.on_commit(lambda: publish_chat_message(message_id))
