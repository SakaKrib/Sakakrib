from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('subscriptions', '0002_seed_subscription_plans'),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name='subscriptioninvoice',
            name='subscription_invoice_paypal_sub_uidx',
        ),
    ]
