from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('listings', '0007_listing_draft_data'),
    ]

    operations = [
        migrations.RemoveIndex(
            model_name='listing',
            name='idx_listings_user_id',
        ),
        migrations.AlterField(
            model_name='listing',
            name='deposit_amount',
            field=models.DecimalField(blank=True, decimal_places=2, default=0, max_digits=14, null=True),
        ),
        migrations.AlterField(
            model_name='listing',
            name='price_kes',
            field=models.DecimalField(blank=True, decimal_places=2, default=0, max_digits=14, null=True),
        ),
        migrations.AlterField(
            model_name='listingpaymentintent',
            name='paypal_fx_rate',
            field=models.DecimalField(blank=True, decimal_places=8, max_digits=18, null=True),
        ),
        migrations.AlterField(
            model_name='listingpaymentintent',
            name='provider_amount',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True),
        ),
        migrations.AddIndex(
            model_name='listing',
            index=models.Index(fields=['user'], name='idx_listings_user_id'),
        ),
    ]
