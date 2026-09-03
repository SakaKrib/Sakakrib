from decimal import Decimal

from django.db import migrations, models


def set_mover_commission_rate(apps, schema_editor):
    PlatformSettings = apps.get_model('core', 'PlatformSettings')
    PlatformSettings.objects.update_or_create(
        id=True,
        defaults={'mover_commission_rate': Decimal('0.20')},
    )


class Migration(migrations.Migration):
    dependencies = [
        ('core', '0002_seed_platform_settings'),
    ]

    operations = [
        migrations.AlterField(
            model_name='platformsettings',
            name='mover_commission_rate',
            field=models.DecimalField(decimal_places=6, default=0.2, max_digits=10),
        ),
        migrations.RunPython(set_mover_commission_rate, migrations.RunPython.noop),
    ]
