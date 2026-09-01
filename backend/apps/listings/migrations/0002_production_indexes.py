from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('listings', '0001_initial'),
    ]

    operations = [
        migrations.AddIndex(
            model_name='listing',
            index=models.Index(fields=['city'], name='idx_listings_city'),
        ),
        migrations.AddIndex(
            model_name='listing',
            index=models.Index(fields=['-created_at'], name='idx_listings_created_at'),
        ),
        migrations.AddIndex(
            model_name='listing',
            index=models.Index(fields=['user_id'], name='idx_listings_user_id'),
        ),
        migrations.AddIndex(
            model_name='listing',
            index=models.Index(fields=['is_property_management'], name='listings_property_management_idx'),
        ),
    ]
