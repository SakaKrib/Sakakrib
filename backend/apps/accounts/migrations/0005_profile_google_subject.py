from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('accounts', '0004_refresh_tokens'),
    ]

    operations = [
        migrations.AddField(
            model_name='profile',
            name='google_subject',
            field=models.CharField(blank=True, max_length=255, null=True, unique=True),
        ),
    ]
