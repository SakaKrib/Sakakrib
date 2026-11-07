import django.utils.timezone
import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0014_sale_payment_records'),
    ]

    operations = [
        migrations.CreateModel(
            name='MaintenanceRequest',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('owner_id', models.UUIDField()),
                ('listing_id', models.UUIDField()),
                ('unit_id', models.UUIDField()),
                ('renter_user_id', models.UUIDField()),
                ('title', models.TextField()),
                ('description', models.TextField(blank=True, default='')),
                ('category', models.TextField(default='other')),
                ('priority', models.TextField(default='normal')),
                ('status', models.TextField(default='OPEN')),
                ('response_note', models.TextField(blank=True, default='')),
                ('assigned_name', models.TextField(blank=True, default='')),
                ('assigned_phone', models.TextField(blank=True, default='')),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('updated_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('resolved_at', models.DateTimeField(blank=True, null=True)),
            ],
            options={'db_table': 'maintenance_requests', 'ordering': ['-created_at']},
        ),
    ]
