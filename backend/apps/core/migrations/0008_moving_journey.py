from django.db import migrations, models
import uuid


class Migration(migrations.Migration):
    dependencies = [
        ('core', '0007_moving_financial_document'),
    ]

    operations = [
        migrations.CreateModel(
            name='MovingJourney',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('booking_id', models.UUIDField()),
                ('mover_id', models.UUIDField()),
                ('tracking_number', models.TextField(unique=True)),
                ('status', models.TextField(default='READY')),
                ('started_at', models.DateTimeField(blank=True, null=True)),
                ('started_by', models.UUIDField(blank=True, null=True)),
                ('start_source', models.TextField(blank=True, null=True)),
                ('completed_at', models.DateTimeField(blank=True, null=True)),
                ('completed_by', models.UUIDField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'db_table': 'moving_journeys',
            },
        ),
        migrations.AddConstraint(
            model_name='movingjourney',
            constraint=models.UniqueConstraint(
                fields=['booking_id'],
                name='moving_journeys_booking_id_key',
            ),
        ),
        migrations.AddConstraint(
            model_name='movingjourney',
            constraint=models.CheckConstraint(
                condition=models.Q(status__in=['READY', 'ACTIVE', 'DELIVERY_PENDING', 'COMPLETED']),
                name='moving_journeys_status_check',
            ),
        ),
        migrations.AddConstraint(
            model_name='movingjourney',
            constraint=models.CheckConstraint(
                condition=models.Q(start_source__isnull=True)
                | models.Q(start_source__in=['MOBILE_APP', 'CHROME']),
                name='moving_journeys_start_source_check',
            ),
        ),
        migrations.AddIndex(
            model_name='movingjourney',
            index=models.Index(fields=['booking_id'], name='mv_journey_booking_idx'),
        ),
        migrations.AddIndex(
            model_name='movingjourney',
            index=models.Index(fields=['mover_id', 'status'], name='mv_journey_mover_st_idx'),
        ),
        migrations.AddIndex(
            model_name='movingjourney',
            index=models.Index(fields=['status'], name='mv_journey_status_idx'),
        ),
    ]
