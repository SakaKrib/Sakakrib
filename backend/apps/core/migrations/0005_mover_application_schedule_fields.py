from django.contrib.postgres.fields import ArrayField
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('core', '0004_set_mover_commission_rate'),
    ]

    operations = [
        migrations.AddField(
            model_name='moverapplication',
            name='working_days',
            field=ArrayField(base_field=models.TextField(), default=list),
        ),
        migrations.AddField(
            model_name='moverapplication',
            name='start_time',
            field=models.TimeField(null=True, blank=True),
        ),
        migrations.AddField(
            model_name='moverapplication',
            name='end_time',
            field=models.TimeField(null=True, blank=True),
        ),
    ]
