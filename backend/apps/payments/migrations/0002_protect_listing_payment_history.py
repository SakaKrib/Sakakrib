from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('payments', '0001_initial'),
        ('listings', '0001_initial'),
        ('accounts', '0001_initial'),
    ]

    operations = [
        migrations.AlterField(
            model_name='listingpayment',
            name='listing',
            field=models.ForeignKey(
                db_column='listing_id',
                on_delete=models.PROTECT,
                related_name='listing_payments',
                to='listings.listing',
            ),
        ),
        migrations.AlterField(
            model_name='listingpayment',
            name='user',
            field=models.ForeignKey(
                db_column='user_id',
                on_delete=models.PROTECT,
                related_name='listing_payments',
                to='accounts.profile',
            ),
        ),
    ]
