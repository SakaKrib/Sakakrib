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
