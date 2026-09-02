from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ('accounts', '0004_refresh_tokens'),
        ('listings', '0002_production_indexes'),
    ]

    operations = [
        migrations.AlterField(
            model_name='listing',
            name='user_id',
            field=models.ForeignKey(
                db_column='user_id',
                on_delete=django.db.models.deletion.CASCADE,
                related_name='listings',
                to='accounts.profile',
            ),
        ),
        migrations.AlterField(
            model_name='listingpaymentintent',
            name='user_id',
            field=models.ForeignKey(
                db_column='user_id',
                on_delete=django.db.models.deletion.CASCADE,
                related_name='listing_payment_intents',
                to='accounts.profile',
            ),
        ),
        migrations.AlterField(
            model_name='listingpaymentintent',
            name='listing_id',
            field=models.ForeignKey(
                blank=True,
                db_column='listing_id',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='payment_intents',
                to='listings.listing',
            ),
        ),
        migrations.AddConstraint(
            model_name='listing',
            constraint=models.CheckConstraint(
                condition=models.Q(status__in=['pending', 'approved', 'rejected']),
                name='listings_status_valid',
            ),
        ),
    ]
