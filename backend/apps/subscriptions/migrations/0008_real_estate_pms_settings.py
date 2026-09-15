from django.db import migrations, models
import uuid


class Migration(migrations.Migration):
    dependencies = [
        ('subscriptions', '0007_remove_duplicate_real_estate_pms_lease'),
    ]

    operations = [
        migrations.CreateModel(
            name='RealEstatePMSSettings',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('real_estate_id', models.UUIDField(unique=True)),
                ('default_rent_due_day', models.PositiveSmallIntegerField(default=1)),
                ('default_payment_tracking_enabled', models.BooleanField(default=True)),
                ('updated_at', models.DateTimeField()),
                ('created_at', models.DateTimeField()),
            ],
            options={'db_table': 'real_estate_pms_settings'},
        ),
    ]
