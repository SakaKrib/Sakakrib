from django.db import migrations, models
from django.db.models import Q


class Migration(migrations.Migration):
    dependencies = [("core", "0003_rent_invoice_external_verification")]

    operations = [
        migrations.AddIndex(
            model_name="chatmessage",
            index=models.Index(fields=["conversation_id", "-created_at"], name="chat_msg_conv_created_desc_idx"),
        ),
        migrations.AddIndex(
            model_name="chatmessage",
            index=models.Index(fields=["conversation_id", "created_at"], name="chat_msg_conv_created_idx"),
        ),
        migrations.AddIndex(
            model_name="chatmessage",
            index=models.Index(fields=["sender_id", "receiver_id"], name="chat_msg_sender_receiver_idx"),
        ),
        migrations.AddIndex(
            model_name="chatmessage",
            index=models.Index(fields=["sender_id"], name="chat_msg_sender_idx"),
        ),
        migrations.AddIndex(
            model_name="chatmessage",
            index=models.Index(fields=["receiver_id"], name="chat_msg_receiver_idx"),
        ),
        migrations.AddIndex(
            model_name="chatmessage",
            index=models.Index(fields=["created_at"], name="chat_msg_created_idx"),
        ),
        migrations.AddIndex(
            model_name="usernotification",
            index=models.Index(fields=["user_id", "-created_at"], name="user_notif_user_created_idx"),
        ),
        migrations.AddConstraint(
            model_name="usernotification",
            constraint=models.UniqueConstraint(
                fields=["event_key"],
                condition=Q(event_key__isnull=False),
                name="user_notifications_event_key_uidx",
            ),
        ),
    ]
