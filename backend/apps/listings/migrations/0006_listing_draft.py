import uuid
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [('listings', '0005_payment_intent_required_timestamps')]
    operations = [
        migrations.CreateModel(
            name='ListingDraft',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('role', models.CharField(max_length=32)),
                ('data', models.JSONField(default=dict)),
                ('status', models.CharField(default='DRAFT', max_length=16)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('user', models.ForeignKey(db_column='user_id', on_delete=django.db.models.deletion.CASCADE, related_name='listing_drafts', to='accounts.profile')),
            ],
            options={'db_table': 'listing_drafts', 'ordering': ['-updated_at']},
        ),
        migrations.AddIndex(model_name='listingdraft', index=models.Index(fields=['user', 'status', '-updated_at'], name='listing_draft_user_status_idx')),
    ]
