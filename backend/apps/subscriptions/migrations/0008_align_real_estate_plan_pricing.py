from django.db import migrations


REAL_ESTATE_PLAN_UPDATES = {
    'STARTER': {
        'max_listings': 5,
        'max_units_per_listing': 5,
        'monthly_price_kes': '500.00',
        'annual_price_kes': '5000.00',
    },
    'GROWTH': {
        'max_listings': 20,
        'max_units_per_listing': 20,
        'monthly_price_kes': '1500.00',
        'annual_price_kes': '15000.00',
    },
    'PRO': {
        'max_listings': None,
        'max_units_per_listing': None,
        'monthly_price_kes': '3500.00',
        'annual_price_kes': '35000.00',
    },
}


def align_real_estate_plan_pricing(apps, schema_editor):
    SubscriptionPlan = apps.get_model('subscriptions', 'SubscriptionPlan')
    for name, values in REAL_ESTATE_PLAN_UPDATES.items():
        SubscriptionPlan.objects.filter(audience='REAL_ESTATE', name=name).update(**values)


def reverse_real_estate_plan_pricing(apps, schema_editor):
    SubscriptionPlan = apps.get_model('subscriptions', 'SubscriptionPlan')
    previous_values = {
        'STARTER': {'max_listings': 10, 'max_units_per_listing': 10, 'monthly_price_kes': '2000.00', 'annual_price_kes': '20000.00'},
        'GROWTH': {'max_listings': 30, 'max_units_per_listing': 30, 'monthly_price_kes': '5000.00', 'annual_price_kes': '50000.00'},
        'PRO': {'max_listings': 50, 'max_units_per_listing': 50, 'monthly_price_kes': '10000.00', 'annual_price_kes': '100000.00'},
    }
    for name, values in previous_values.items():
        SubscriptionPlan.objects.filter(audience='REAL_ESTATE', name=name).update(**values)


class Migration(migrations.Migration):
    dependencies = [('subscriptions', '0007_remove_duplicate_real_estate_pms_lease')]
    operations = [migrations.RunPython(align_real_estate_plan_pricing, reverse_real_estate_plan_pricing)]
