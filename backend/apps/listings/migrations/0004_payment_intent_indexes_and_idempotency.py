from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('listings', '0003_production_constraints_and_foreign_keys'),
    ]

    operations = [
        migrations.AddIndex(
            model_name='listingpaymentintent',
            index=models.Index(
                fields=['listing'],
                name='idx_listing_payment_intents_listing_id',
            ),
        ),
        migrations.AddIndex(
            model_name='listingpaymentintent',
            index=models.Index(
                fields=['user', 'status', '-created_at'],
                name='listing_payment_intents_user_status_idx',
            ),
        ),
        migrations.AddIndex(
            model_name='listingpaymentintent',
            index=models.Index(
                fields=['provider', 'provider_reference'],
                condition=models.Q(provider_reference__isnull=False),
                name='listing_payment_intents_provider_reference_idx',
            ),
        ),
        migrations.AddConstraint(
            model_name='listingpaymentintent',
            constraint=models.UniqueConstraint(
                condition=models.Q(provider_reference__isnull=False),
                fields=('provider_reference',),
                name='listing_payment_intents_provider_reference_key',
            ),
        ),
        migrations.AddConstraint(
            model_name='listingpaymentintent',
            constraint=models.UniqueConstraint(
                condition=models.Q(paypal_order_id__isnull=False),
                fields=('paypal_order_id',),
                name='listing_payment_intents_paypal_order_id_key',
            ),
        ),
    ]
