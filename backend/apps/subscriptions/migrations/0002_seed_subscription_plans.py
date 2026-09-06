from django.db import migrations
from datetime import datetime, timezone
from uuid import UUID


LANDLORD_CREATED_AT = datetime(2026, 8, 14, 16, 4, 24, 496778, tzinfo=timezone.utc)
REAL_ESTATE_CREATED_AT = datetime(2026, 8, 18, 20, 42, 46, 840501, tzinfo=timezone.utc)


PLANS = [
    {
        'id': UUID('e77ef15d-8c6e-4a2e-8a53-177217f21c60'),
        'name': 'STARTER',
        'audience': 'LANDLORD',
        'max_listings': 5,
        'max_units_per_listing': 5,
        'monthly_price_kes': '500.00',
        'annual_price_kes': '5000.00',
        'created_at': LANDLORD_CREATED_AT,
    },
    {
        'id': UUID('f4f50355-9b37-466a-add3-c0f1d16b9e63'),
        'name': 'GROWTH',
        'audience': 'LANDLORD',
        'max_listings': 20,
        'max_units_per_listing': 20,
        'monthly_price_kes': '1500.00',
        'annual_price_kes': '15000.00',
        'created_at': LANDLORD_CREATED_AT,
    },
    {
        'id': UUID('d3530c0b-ec22-47d5-b835-ef1a26cf7f5b'),
        'name': 'PRO',
        'audience': 'LANDLORD',
        'max_listings': None,
        'max_units_per_listing': None,
        'monthly_price_kes': '3500.00',
        'annual_price_kes': '35000.00',
        'created_at': LANDLORD_CREATED_AT,
    },
    {
        'id': UUID('b0458104-f515-4afd-969a-3fa256ce3dee'),
        'name': 'STARTER',
        'audience': 'REAL_ESTATE',
        'max_listings': 10,
        'max_units_per_listing': 10,
        'monthly_price_kes': '2000.00',
        'annual_price_kes': '20000.00',
        'created_at': REAL_ESTATE_CREATED_AT,
    },
    {
        'id': UUID('312127ba-f992-4cf7-b189-6bf1d1cdde66'),
        'name': 'GROWTH',
        'audience': 'REAL_ESTATE',
        'max_listings': 30,
        'max_units_per_listing': 30,
        'monthly_price_kes': '5000.00',
        'annual_price_kes': '50000.00',
        'created_at': REAL_ESTATE_CREATED_AT,
    },
    {
        'id': UUID('e396d1b0-7c23-43a8-8017-611c7e0754fb'),
        'name': 'PRO',
        'audience': 'REAL_ESTATE',
        'max_listings': 50,
        'max_units_per_listing': 50,
        'monthly_price_kes': '10000.00',
        'annual_price_kes': '100000.00',
        'created_at': REAL_ESTATE_CREATED_AT,
    },
    {
        'id': UUID('ee9d84dc-c2e1-4f59-9963-016164b05f41'),
        'name': 'ENTERPRISE',
        'audience': 'REAL_ESTATE',
        'max_listings': None,
        'max_units_per_listing': None,
        'monthly_price_kes': '20000.00',
        'annual_price_kes': '200000.00',
        'created_at': REAL_ESTATE_CREATED_AT,
    },
]


def seed_subscription_plans(apps, schema_editor):
    SubscriptionPlan = apps.get_model('subscriptions', 'SubscriptionPlan')

    existing_ids = set(
        SubscriptionPlan.objects.filter(
            id__in=[plan['id'] for plan in PLANS]
        ).values_list('id', flat=True)
    )

    SubscriptionPlan.objects.bulk_create(
        [
            SubscriptionPlan(**plan)
            for plan in PLANS
            if plan['id'] not in existing_ids
        ]
    )


def unseed_subscription_plans(apps, schema_editor):
    SubscriptionPlan = apps.get_model('subscriptions', 'SubscriptionPlan')
    SubscriptionPlan.objects.filter(
        id__in=[plan['id'] for plan in PLANS]
    ).delete()


class Migration(migrations.Migration):
    dependencies = [
        ('subscriptions', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(seed_subscription_plans, unseed_subscription_plans),
    ]
