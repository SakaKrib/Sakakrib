from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('core', '0008_moving_journey'),
    ]

    operations = [
        migrations.AddField(
            model_name='movingjourney',
            name='phase',
            field=models.TextField(default='HEADING_TO_PICKUP'),
        ),
        migrations.AddField(
            model_name='movingjourney',
            name='pickup_confirmed_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='movingjourney',
            name='pickup_confirmed_by',
            field=models.UUIDField(blank=True, null=True),
        ),
        migrations.AddConstraint(
            model_name='movingjourney',
            constraint=models.CheckConstraint(
                condition=models.Q(phase__in=['HEADING_TO_PICKUP', 'IN_TRANSIT']),
                name='moving_journeys_phase_check',
            ),
        ),
        migrations.AddIndex(
            model_name='movingjourney',
            index=models.Index(fields=['phase'], name='mv_journey_phase_idx'),
        ),
    ]
