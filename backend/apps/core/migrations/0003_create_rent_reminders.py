from django.db import migrations, models
import uuid


class Migration(migrations.Migration):
    dependencies = [
        ('core', '0002_seed_platform_settings'),
    ]

    operations = [
        migrations.CreateModel(
            name='RentReminder',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('renter_assoc_id', models.UUIDField()),
                ('landlord_id', models.UUIDField()),
                ('payment_period_year', models.IntegerField()),
                ('payment_period_month', models.IntegerField()),
                ('due_date', models.DateField()),
                ('scheduled_for', models.DateTimeField()),
                ('offset_days', models.IntegerField()),
                ('channel', models.TextField()),
                ('message', models.TextField()),
                ('status', models.TextField(default='PENDING')),
                ('sent_at', models.DateTimeField(blank=True, null=True)),
                ('delivered_at', models.DateTimeField(blank=True, null=True)),
                ('failed_at', models.DateTimeField(blank=True, null=True)),
                ('failure_reason', models.TextField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'db_table': 'rent_reminders',
                'indexes': [
                    models.Index(fields=['scheduled_for', 'status'], name='rent_reminders_due_idx'),
                ],
                'constraints': [
                    models.UniqueConstraint(
                        fields=[
                            'renter_assoc_id',
                            'payment_period_year',
                            'payment_period_month',
                            'offset_days',
                            'channel',
                        ],
                        name='rent_reminders_renter_assoc_period_offset_channel_key',
                    ),
                ],
            },
        ),
    ]
