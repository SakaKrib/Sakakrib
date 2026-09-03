from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ('listings', '0008_remove_listing_idx_listings_user_id_and_more'),
    ]

    operations = [
        migrations.RunSQL(
            sql="ALTER INDEX IF EXISTS listings_property_management_idx RENAME TO listing_prop_mgmt_idx;",
            reverse_sql="ALTER INDEX IF EXISTS listing_prop_mgmt_idx RENAME TO listings_property_management_idx;",
        ),
        migrations.RunSQL(
            sql="ALTER INDEX IF EXISTS idx_listing_payment_intents_listing_id RENAME TO listing_pay_intent_listing;",
            reverse_sql="ALTER INDEX IF EXISTS listing_pay_intent_listing RENAME TO idx_listing_payment_intents_listing_id;",
        ),
        migrations.RunSQL(
            sql="ALTER INDEX IF EXISTS listing_payment_intents_user_status_idx RENAME TO listing_pay_intent_user;",
            reverse_sql="ALTER INDEX IF EXISTS listing_pay_intent_user RENAME TO listing_payment_intents_user_status_idx;",
        ),
        migrations.RunSQL(
            sql="ALTER INDEX IF EXISTS listing_payment_intents_provider_reference_idx RENAME TO listing_pay_intent_provider;",
            reverse_sql="ALTER INDEX IF EXISTS listing_pay_intent_provider RENAME TO listing_payment_intents_provider_reference_idx;",
        ),
    ]
