from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ('listings', '0008_remove_listing_idx_listings_user_id_and_more'),
    ]

    operations = [
        migrations.RenameIndex(
            model_name='listing',
            old_name='listings_property_management_idx',
            new_name='listing_prop_mgmt_idx',
        ),
        migrations.RenameIndex(
            model_name='listingpaymentintent',
            old_name='idx_listing_payment_intents_listing_id',
            new_name='listing_pay_intent_listing',
        ),
        migrations.RenameIndex(
            model_name='listingpaymentintent',
            old_name='listing_payment_intents_user_status_idx',
            new_name='listing_pay_intent_user',
        ),
        migrations.RenameIndex(
            model_name='listingpaymentintent',
            old_name='listing_payment_intents_provider_reference_idx',
            new_name='listing_pay_intent_provider',
        ),
    ]
