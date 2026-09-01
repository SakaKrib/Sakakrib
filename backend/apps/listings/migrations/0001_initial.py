import uuid

from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        ('accounts', '0003_schema_reconciliation_marker'),
    ]

    operations = [
        migrations.CreateModel(
            name='Listing',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('user_id', models.UUIDField()),
                ('title', models.TextField(default='')),
                ('description', models.TextField(default='')),
                ('city', models.TextField(default='')),
                ('county', models.TextField(default='')),
                ('location_search', models.TextField(blank=True, null=True)),
                ('latitude', models.FloatField(blank=True, null=True)),
                ('longitude', models.FloatField(blank=True, null=True)),
                ('property_name', models.TextField(blank=True, null=True)),
                ('property_type', models.TextField(blank=True, null=True)),
                ('price_kes', models.DecimalField(decimal_places=2, default=0, max_digits=14, null=True)),
                ('listing_type', models.TextField(default='rent')),
                ('deposit_required', models.BooleanField(default=False, null=True)),
                ('deposit_structure', models.TextField(blank=True, default='fixed', null=True)),
                ('deposit_amount', models.DecimalField(decimal_places=2, default=0, max_digits=14, null=True)),
                ('size', models.TextField(blank=True, default='', null=True)),
                ('beds', models.IntegerField(default=0, null=True)),
                ('baths', models.IntegerField(default=0, null=True)),
                ('contact_phone', models.TextField(blank=True, default='', null=True)),
                ('contact_email', models.TextField(blank=True, default='', null=True)),
                ('social_links', models.JSONField(default=list)),
                ('booking_enabled', models.BooleanField(default=False)),
                ('payment_enabled', models.BooleanField(default=False)),
                ('is_property_management', models.BooleanField(default=False)),
                ('is_paid', models.BooleanField(default=False)),
                ('is_published', models.BooleanField(default=False)),
                ('approval_status', models.TextField(default='pending_review')),
                ('is_approved', models.BooleanField(default=False)),
                ('status', models.TextField(default='pending')),
                ('admin_reviewed_at', models.DateTimeField(blank=True, null=True)),
                ('admin_review_note', models.TextField(blank=True, default='', null=True)),
                ('ai_caption', models.TextField(blank=True, null=True)),
                ('ai_caption_generated_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(blank=True, null=True)),
                ('updated_at', models.DateTimeField(blank=True, null=True)),
            ],
            options={'db_table': 'listings'},
        ),
        migrations.CreateModel(
            name='ListingPaymentIntent',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('user_id', models.UUIDField()),
                ('role', models.TextField()),
                ('amount_kes', models.DecimalField(decimal_places=2, default=1000, max_digits=12)),
                ('status', models.TextField(default='PENDING')),
                ('listing_data', models.JSONField()),
                ('provider', models.TextField(blank=True, null=True)),
                ('provider_reference', models.TextField(blank=True, null=True)),
                ('created_at', models.DateTimeField(blank=True, null=True)),
                ('updated_at', models.DateTimeField(blank=True, null=True)),
                ('paid_at', models.DateTimeField(blank=True, null=True)),
                ('expires_at', models.DateTimeField(blank=True, null=True)),
                ('listing_id', models.UUIDField(blank=True, null=True)),
                ('provider_amount', models.DecimalField(decimal_places=2, max_digits=14, null=True)),
                ('provider_currency', models.TextField(blank=True, null=True)),
                ('paypal_order_id', models.TextField(blank=True, null=True)),
                ('paypal_fx_rate', models.DecimalField(decimal_places=8, max_digits=18, null=True)),
            ],
            options={'db_table': 'listing_payment_intents'},
        ),
        migrations.AddConstraint(
            model_name='listing',
            constraint=models.CheckConstraint(
                condition=models.Q(listing_type__in=['rent', 'sale']),
                name='listings_listing_type_valid',
            ),
        ),
        migrations.AddConstraint(
            model_name='listing',
            constraint=models.CheckConstraint(
                condition=models.Q(deposit_structure__in=['fixed', 'installments']) | models.Q(deposit_structure__isnull=True),
                name='listings_deposit_structure_valid',
            ),
        ),
        migrations.AddConstraint(
            model_name='listing',
            constraint=models.CheckConstraint(
                condition=models.Q(approval_status__in=['pending_review', 'approved', 'rejected']),
                name='listings_approval_status_valid',
            ),
        ),
        migrations.AddConstraint(
            model_name='listingpaymentintent',
            constraint=models.CheckConstraint(
                condition=models.Q(role__in=['landlord', 'real_estate']),
                name='listing_payment_intents_role_valid',
            ),
        ),
        migrations.AddConstraint(
            model_name='listingpaymentintent',
            constraint=models.CheckConstraint(
                condition=models.Q(amount_kes=1000),
                name='listing_payment_intents_amount_1000',
            ),
        ),
        migrations.AddConstraint(
            model_name='listingpaymentintent',
            constraint=models.CheckConstraint(
                condition=models.Q(status__in=['PENDING', 'PAID', 'FAILED', 'CANCELLED', 'EXPIRED']),
                name='listing_payment_intents_status_valid',
            ),
        ),
        migrations.RunSQL(
            sql="""
                ALTER TABLE listings
                    ALTER COLUMN id SET DEFAULT gen_random_uuid(),
                    ALTER COLUMN title SET DEFAULT '',
                    ALTER COLUMN description SET DEFAULT '',
                    ALTER COLUMN city SET DEFAULT '',
                    ALTER COLUMN county SET DEFAULT '',
                    ALTER COLUMN price_kes SET DEFAULT 0,
                    ALTER COLUMN listing_type SET DEFAULT 'rent',
                    ALTER COLUMN deposit_required SET DEFAULT false,
                    ALTER COLUMN deposit_structure SET DEFAULT 'fixed',
                    ALTER COLUMN deposit_amount SET DEFAULT 0,
                    ALTER COLUMN size SET DEFAULT '',
                    ALTER COLUMN beds SET DEFAULT 0,
                    ALTER COLUMN baths SET DEFAULT 0,
                    ALTER COLUMN contact_phone SET DEFAULT '',
                    ALTER COLUMN contact_email SET DEFAULT '',
                    ALTER COLUMN social_links SET DEFAULT '[]'::jsonb,
                    ALTER COLUMN is_paid SET DEFAULT false,
                    ALTER COLUMN is_published SET DEFAULT false,
                    ALTER COLUMN approval_status SET DEFAULT 'pending_review',
                    ALTER COLUMN is_approved SET DEFAULT false,
                    ALTER COLUMN booking_enabled SET DEFAULT false,
                    ALTER COLUMN payment_enabled SET DEFAULT false,
                    ALTER COLUMN is_property_management SET DEFAULT false,
                    ALTER COLUMN status SET DEFAULT 'pending',
                    ALTER COLUMN created_at SET DEFAULT now(),
                    ALTER COLUMN updated_at SET DEFAULT now();

                ALTER TABLE listing_payment_intents
                    ALTER COLUMN id SET DEFAULT gen_random_uuid(),
                    ALTER COLUMN amount_kes SET DEFAULT 1000.00,
                    ALTER COLUMN status SET DEFAULT 'PENDING',
                    ALTER COLUMN created_at SET DEFAULT now(),
                    ALTER COLUMN updated_at SET DEFAULT now(),
                    ALTER COLUMN expires_at SET DEFAULT (now() + interval '15 minutes');
            """,
            reverse_sql="""
                ALTER TABLE listings
                    ALTER COLUMN id DROP DEFAULT,
                    ALTER COLUMN title DROP DEFAULT,
                    ALTER COLUMN description DROP DEFAULT,
                    ALTER COLUMN city DROP DEFAULT,
                    ALTER COLUMN county DROP DEFAULT,
                    ALTER COLUMN price_kes DROP DEFAULT,
                    ALTER COLUMN listing_type DROP DEFAULT,
                    ALTER COLUMN deposit_required DROP DEFAULT,
                    ALTER COLUMN deposit_structure DROP DEFAULT,
                    ALTER COLUMN deposit_amount DROP DEFAULT,
                    ALTER COLUMN size DROP DEFAULT,
                    ALTER COLUMN beds DROP DEFAULT,
                    ALTER COLUMN baths DROP DEFAULT,
                    ALTER COLUMN contact_phone DROP DEFAULT,
                    ALTER COLUMN contact_email DROP DEFAULT,
                    ALTER COLUMN social_links DROP DEFAULT,
                    ALTER COLUMN is_paid DROP DEFAULT,
                    ALTER COLUMN is_published DROP DEFAULT,
                    ALTER COLUMN approval_status DROP DEFAULT,
                    ALTER COLUMN is_approved DROP DEFAULT,
                    ALTER COLUMN booking_enabled DROP DEFAULT,
                    ALTER COLUMN payment_enabled DROP DEFAULT,
                    ALTER COLUMN is_property_management DROP DEFAULT,
                    ALTER COLUMN status DROP DEFAULT,
                    ALTER COLUMN created_at DROP DEFAULT,
                    ALTER COLUMN updated_at DROP DEFAULT;

                ALTER TABLE listing_payment_intents
                    ALTER COLUMN id DROP DEFAULT,
                    ALTER COLUMN amount_kes DROP DEFAULT,
                    ALTER COLUMN status DROP DEFAULT,
                    ALTER COLUMN created_at DROP DEFAULT,
                    ALTER COLUMN updated_at DROP DEFAULT,
                    ALTER COLUMN expires_at DROP DEFAULT;
            """,
        ),
    ]
