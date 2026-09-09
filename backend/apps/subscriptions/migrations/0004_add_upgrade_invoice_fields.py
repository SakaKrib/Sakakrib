from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('subscriptions', '0003_allow_recurring_paypal_invoices'),
    ]

    operations = [
        migrations.AddField(
            model_name='subscriptioninvoice',
            name='upgrade_plan_id',
            field=models.UUIDField(null=True, blank=True),
        ),
        migrations.AddField(
            model_name='subscriptioninvoice',
            name='upgrade_billing_cycle',
            field=models.TextField(null=True, blank=True),
        ),
    ]
