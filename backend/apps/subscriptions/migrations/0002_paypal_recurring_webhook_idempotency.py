from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('subscriptions', '0001_initial'),
    ]

    operations = [
        migrations.AddConstraint(
            model_name='subscriptioninvoice',
            constraint=models.UniqueConstraint(
                fields=('webhook_event_id',),
                condition=models.Q(webhook_event_id__isnull=False),
                name='subscription_invoices_webhook_event_uidx',
            ),
        ),
    ]
