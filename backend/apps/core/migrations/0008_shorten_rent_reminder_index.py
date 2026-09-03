from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ('core', '0007_subscription_renewal_attempts'),
    ]

    operations = [
        migrations.RunSQL(
            sql="ALTER INDEX IF EXISTS idx_rent_reminders_due_schedule RENAME TO rent_reminders_due_idx;",
            reverse_sql="ALTER INDEX IF EXISTS rent_reminders_due_idx RENAME TO idx_rent_reminders_due_schedule;",
        ),
    ]
