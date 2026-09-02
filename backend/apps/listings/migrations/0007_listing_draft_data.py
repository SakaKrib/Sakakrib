from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('listings', '0006_listing_draft_flag')]

    operations = [
        migrations.AddField(
            model_name='listing',
            name='draft_data',
            field=models.JSONField(default=dict),
        ),
    ]
