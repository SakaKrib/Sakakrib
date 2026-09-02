from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('subscriptions', '0002_entitlement_integrity'),
        ('listings', '0006_listing_draft_flag'),
    ]

    operations = [
        migrations.AddField(
            model_name='subscriptioninvoice',
            name='listing',
            field=models.ForeignKey(
                blank=True,
                db_column='listing_id',
                null=True,
                on_delete=models.SET_NULL,
                related_name='subscription_invoices',
                to='listings.listing',
            ),
        ),
    ]
