from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('core', '0005_rent_production_indexes'),
    ]

    operations = [
        migrations.AddConstraint(
            model_name='rentremindersetting',
            constraint=models.UniqueConstraint(
                fields=('renter_assoc_id',),
                name='rent_reminder_settings_renter_assoc_id_key',
            ),
        ),
        migrations.AddConstraint(
            model_name='rentreminder',
            constraint=models.UniqueConstraint(
                fields=(
                    'renter_assoc_id',
                    'payment_period_year',
                    'payment_period_month',
                    'offset_days',
                    'channel',
                ),
                name='rent_reminders_renter_assoc_period_offset_channel_key',
            ),
        ),
        migrations.AddIndex(
            model_name='rentreminder',
            index=models.Index(
                fields=('scheduled_for', 'status'),
                name='idx_rent_reminders_due_schedule',
            ),
        ),
    ]
