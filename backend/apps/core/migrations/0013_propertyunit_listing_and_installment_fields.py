from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0012_alter_communitypost_created_at'),
    ]

    operations = [
        migrations.AddField(
            model_name='propertyunit',
            name='listing_type',
            field=models.TextField(default='rent'),
        ),
        migrations.AddField(
            model_name='propertyunit',
            name='sale_price',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True),
        ),
        migrations.AddField(
            model_name='propertyunit',
            name='installment_total_price',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True),
        ),
        migrations.AddField(
            model_name='propertyunit',
            name='installment_deposit',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True),
        ),
        migrations.AddField(
            model_name='propertyunit',
            name='installment_amount',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True),
        ),
        migrations.AddField(
            model_name='propertyunit',
            name='installment_frequency',
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='propertyunit',
            name='installment_periods',
            field=models.IntegerField(blank=True, null=True),
        ),
    ]
