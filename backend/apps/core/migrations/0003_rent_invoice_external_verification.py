from django.db import migrations, models


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
            field=models.JSONField(default=lambda: ['IN_APP']),
        ),
        migrations.AlterField(
            model_name='rentremindersetting',
            name='offsets_days',
            field=models.JSONField(default=lambda: [7, 3, 1, 0, -1]),
        ),
    ]
