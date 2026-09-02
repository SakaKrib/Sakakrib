import uuid
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('listings', '0005_payment_intent_required_timestamps')]
    operations = [
        migrations.CreateModel(
            name='ListingDraft',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('user_id', models.UUIDField()),
                ('role', models.CharField(max_length=32)),
                ('data', models.JSONField(default=dict)),
                ('status', models.CharField(default='DRAFT', max_length=16)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={'db_table': 'listing_drafts', 'ordering': ['-updated_at']},
        ),
        migrations.AddIndex(model_name='listingdraft', index=models.Index(fields=['user_id', 'status', '-updated_at'], name='listing_draft_user_status_idx')),
    ]
