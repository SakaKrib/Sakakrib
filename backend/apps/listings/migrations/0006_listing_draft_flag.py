from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('listings', '0005_payment_intent_required_timestamps')]
    operations = [
        migrations.AddField(
            model_name='listing',
            name='is_draft',
            field=models.BooleanField(default=False),
        ),
        migrations.AddIndex(
            model_name='listing',
            index=models.Index(fields=['user', 'is_draft', '-updated_at'], name='listings_user_draft_idx'),
        ),
    ]
