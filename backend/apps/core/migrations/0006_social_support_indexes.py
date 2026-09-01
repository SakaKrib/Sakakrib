from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ('core', '0005_rent_production_indexes'),
    ]

    operations = [
        migrations.RunSQL(
            sql="CREATE INDEX IF NOT EXISTS idx_community_posts_created_at ON community_posts (created_at DESC);",
            reverse_sql="DROP INDEX IF EXISTS idx_community_posts_created_at;",
        ),
        migrations.RunSQL(
            sql="CREATE INDEX IF NOT EXISTS idx_reviews_mover_id ON reviews (mover_id);",
            reverse_sql="DROP INDEX IF EXISTS idx_reviews_mover_id;",
        ),
        migrations.RunSQL(
            sql="CREATE INDEX IF NOT EXISTS idx_reviews_reviewee_id ON reviews (reviewee_id);",
            reverse_sql="DROP INDEX IF EXISTS idx_reviews_reviewee_id;",
        ),
        migrations.RunSQL(
            sql="CREATE UNIQUE INDEX IF NOT EXISTS reviews_mover_booking_uidx ON reviews (booking_id) WHERE booking_id IS NOT NULL;",
            reverse_sql="DROP INDEX IF EXISTS reviews_mover_booking_uidx;",
        ),
        migrations.RunSQL(
            sql="CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets (status, created_at DESC);",
            reverse_sql="DROP INDEX IF EXISTS idx_support_tickets_status;",
        ),
        migrations.RunSQL(
            sql="CREATE INDEX IF NOT EXISTS idx_terms_user_id ON terms_acceptance (user_id);",
            reverse_sql="DROP INDEX IF EXISTS idx_terms_user_id;",
        ),
    ]
