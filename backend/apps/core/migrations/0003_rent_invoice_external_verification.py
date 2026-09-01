from django.contrib.postgres.fields import ArrayField
from django.db import migrations, models

from apps.core.domain_rent import (
    default_rent_reminder_channels,
    default_rent_reminder_offsets,
)


class Migration(migrations.Migration):
    dependencies = [
        ('core', '0002_mover_and_webhook_integrity'),
    ]

    operations = [
        migrations.AlterField(
            model_name='rentinvoice',
            name='invoice_number',
            field=models.TextField(unique=True),
        ),
        migrations.AddField(
            model_name='rentinvoice',
            name='payment_date',
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='rentinvoice',
            name='payment_method',
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='rentinvoice',
            name='transaction_reference',
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='rentpaymentsubmission',
            name='payment_date',
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='rentpaymentsubmission',
            name='payment_method',
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name='rentremindersetting',
            name='channels',
            field=ArrayField(
                base_field=models.TextField(),
                default=default_rent_reminder_channels,
                size=None,
            ),
        ),
        migrations.AlterField(
            model_name='rentremindersetting',
            name='offsets_days',
            field=ArrayField(
                base_field=models.IntegerField(),
                default=default_rent_reminder_offsets,
                size=None,
            ),
        ),
    ]
