from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [("core", "0004_chat_notification_indexes")]

    operations = [
        migrations.RunSQL(
            sql="CREATE INDEX IF NOT EXISTS property_units_listing_id_idx ON property_units (listing_id);",
            reverse_sql="DROP INDEX IF EXISTS property_units_listing_id_idx;",
        ),
        migrations.RunSQL(
            sql="CREATE INDEX IF NOT EXISTS property_units_user_id_idx ON property_units (user_id);",
            reverse_sql="DROP INDEX IF EXISTS property_units_user_id_idx;",
        ),
        migrations.RunSQL(
            sql="CREATE INDEX IF NOT EXISTS property_units_availability_idx ON property_units (availability);",
            reverse_sql="DROP INDEX IF EXISTS property_units_availability_idx;",
        ),
        migrations.RunSQL(
            sql="CREATE INDEX IF NOT EXISTS property_units_rent_paid_through_idx ON property_units (rent_paid_through_month) WHERE rent_paid_through_month IS NOT NULL;",
            reverse_sql="DROP INDEX IF EXISTS property_units_rent_paid_through_idx;",
        ),
        migrations.RunSQL(
            sql="CREATE INDEX IF NOT EXISTS renter_assoc_landlord_id_idx ON renter_unit_associations (landlord_id);",
            reverse_sql="DROP INDEX IF EXISTS renter_assoc_landlord_id_idx;",
        ),
        migrations.RunSQL(
            sql="CREATE INDEX IF NOT EXISTS renter_assoc_unit_id_idx ON renter_unit_associations (unit_id);",
            reverse_sql="DROP INDEX IF EXISTS renter_assoc_unit_id_idx;",
        ),
        migrations.RunSQL(
            sql="CREATE INDEX IF NOT EXISTS renter_assoc_renter_user_id_idx ON renter_unit_associations (renter_user_id);",
            reverse_sql="DROP INDEX IF EXISTS renter_assoc_renter_user_id_idx;",
        ),
        migrations.RunSQL(
            sql="CREATE INDEX IF NOT EXISTS renter_assoc_unit_status_idx ON renter_unit_associations (unit_id, status);",
            reverse_sql="DROP INDEX IF EXISTS renter_assoc_unit_status_idx;",
        ),
        migrations.RunSQL(
            sql="CREATE UNIQUE INDEX IF NOT EXISTS renter_unit_associations_invite_token_hash_key ON renter_unit_associations (invite_token_hash);",
            reverse_sql="DROP INDEX IF EXISTS renter_unit_associations_invite_token_hash_key;",
        ),
        migrations.RunSQL(
            sql="CREATE UNIQUE INDEX IF NOT EXISTS renter_unit_associations_one_active_per_unit_idx ON renter_unit_associations (unit_id) WHERE status = 'ACTIVE';",
            reverse_sql="DROP INDEX IF EXISTS renter_unit_associations_one_active_per_unit_idx;",
        ),
        migrations.RunSQL(
            sql="CREATE INDEX IF NOT EXISTS rent_invoice_periods_assoc_idx ON rent_invoice_periods (renter_assoc_id, period_year, period_month);",
            reverse_sql="DROP INDEX IF EXISTS rent_invoice_periods_assoc_idx;",
        ),
        migrations.RunSQL(
            sql="CREATE UNIQUE INDEX IF NOT EXISTS rent_invoice_periods_invoice_period_key ON rent_invoice_periods (invoice_id, period_year, period_month);",
            reverse_sql="DROP INDEX IF EXISTS rent_invoice_periods_invoice_period_key;",
        ),
        migrations.RunSQL(
            sql="CREATE INDEX IF NOT EXISTS rent_invoice_periods_invoice_idx ON rent_invoice_periods (invoice_id);",
            reverse_sql="DROP INDEX IF EXISTS rent_invoice_periods_invoice_idx;",
        ),
        migrations.RunSQL(
            sql="CREATE INDEX IF NOT EXISTS rent_invoices_landlord_idx ON rent_invoices (landlord_id, created_at DESC);",
            reverse_sql="DROP INDEX IF EXISTS rent_invoices_landlord_idx;",
        ),
        migrations.RunSQL(
            sql="CREATE INDEX IF NOT EXISTS rent_invoices_renter_idx ON rent_invoices (renter_user_id, created_at DESC);",
            reverse_sql="DROP INDEX IF EXISTS rent_invoices_renter_idx;",
        ),
        migrations.RunSQL(
            sql="CREATE INDEX IF NOT EXISTS rent_invoices_unit_idx ON rent_invoices (unit_id, due_date);",
            reverse_sql="DROP INDEX IF EXISTS rent_invoices_unit_idx;",
        ),
        migrations.RunSQL(
            sql="CREATE INDEX IF NOT EXISTS rent_payment_submissions_invoice_idx ON rent_payment_submissions (invoice_id, submitted_at DESC);",
            reverse_sql="DROP INDEX IF EXISTS rent_payment_submissions_invoice_idx;",
        ),
        migrations.RunSQL(
            sql="CREATE INDEX IF NOT EXISTS rent_payment_submissions_landlord_idx ON rent_payment_submissions (landlord_id, status, submitted_at DESC);",
            reverse_sql="DROP INDEX IF EXISTS rent_payment_submissions_landlord_idx;",
        ),
        migrations.RunSQL(
            sql="CREATE UNIQUE INDEX IF NOT EXISTS rent_payment_submissions_transaction_reference_uq ON rent_payment_submissions (lower(trim(transaction_reference)));",
            reverse_sql="DROP INDEX IF EXISTS rent_payment_submissions_transaction_reference_uq;",
        ),
        migrations.RunSQL(
            sql="CREATE UNIQUE INDEX IF NOT EXISTS rent_reminder_settings_renter_assoc_id_key ON rent_reminder_settings (renter_assoc_id);",
            reverse_sql="DROP INDEX IF EXISTS rent_reminder_settings_renter_assoc_id_key;",
        ),
        migrations.RunSQL(
            sql="CREATE INDEX IF NOT EXISTS idx_rent_reminders_due_schedule ON rent_reminders (scheduled_for, status);",
            reverse_sql="DROP INDEX IF EXISTS idx_rent_reminders_due_schedule;",
        ),
        migrations.RunSQL(
            sql="CREATE UNIQUE INDEX IF NOT EXISTS rent_reminders_period_channel_key ON rent_reminders (renter_assoc_id, payment_period_year, payment_period_month, offset_days, channel);",
            reverse_sql="DROP INDEX IF EXISTS rent_reminders_period_channel_key;",
        ),
    ]
