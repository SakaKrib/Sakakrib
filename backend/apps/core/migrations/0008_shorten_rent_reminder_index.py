from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ('core', '0007_subscription_renewal_attempts'),
    ]

    operations = [
        migrations.RenameIndex(
            model_name='rentreminder',
            old_name='idx_rent_reminders_due_schedule',
            new_name='rent_reminders_due_idx',
        ),
    ]
