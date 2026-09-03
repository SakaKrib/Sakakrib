from django.db import migrations


def seed_platform_settings(apps, schema_editor):
    PlatformSettings = apps.get_model('core', 'PlatformSettings')
    PlatformSettings.objects.get_or_create(
        id=True,
        defaults={
            'mover_commission_rate': 0.1,
            'mover_operational_markup_rate': 0,
        },
    )


def unseed_platform_settings(apps, schema_editor):
    PlatformSettings = apps.get_model('core', 'PlatformSettings')
    PlatformSettings.objects.filter(id=True).delete()


class Migration(migrations.Migration):
    dependencies = [
        ('core', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(seed_platform_settings, unseed_platform_settings),
    ]
