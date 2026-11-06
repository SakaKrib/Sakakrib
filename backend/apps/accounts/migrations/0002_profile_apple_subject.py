from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="profile",
            name="apple_subject",
            field=models.CharField(blank=True, max_length=255, null=True, unique=True),
        ),
    ]
