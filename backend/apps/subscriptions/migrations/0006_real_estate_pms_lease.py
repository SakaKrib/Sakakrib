from django.db import migrations, models
import uuid


class Migration(migrations.Migration):
    dependencies = [
        ('subscriptions', '0005_real_estate_pms_team'),
    ]

    operations = [
        migrations.CreateModel(
            name='RealEstatePMSLease',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('real_estate_id', models.UUIDField()),
                ('listing_id', models.UUIDField()),
                ('unit_id', models.UUIDField()),
                ('renter_assoc_id', models.UUIDField()),
                ('renter_user_id', models.UUIDField(blank=True, null=True)),
                ('created_by_id', models.UUIDField()),
                ('lease_number', models.TextField(unique=True)),
                ('lease_start', models.DateField()),
                ('lease_end', models.DateField(blank=True, null=True)),
                ('monthly_rent_kes', models.DecimalField(decimal_places=2, max_digits=14)),
                ('deposit_amount_kes', models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ('rent_due_day', models.PositiveSmallIntegerField(default=1)),
                ('status', models.TextField(choices=[('PENDING', 'Pending'), ('ACTIVE', 'Active'), ('ENDED', 'Ended'), ('CANCELLED', 'Cancelled')], default='ACTIVE')),
                ('renewal_notice_days', models.PositiveIntegerField(default=30)),
                ('notes', models.TextField(blank=True, null=True)),
                ('created_at', models.DateTimeField()),
                ('updated_at', models.DateTimeField()),
            ],
            options={
                'db_table': 'real_estate_pms_leases',
            },
        ),
        migrations.AddConstraint(
            model_name='realestatepmslease',
            constraint=models.UniqueConstraint(condition=models.Q(status='ACTIVE'), fields=('unit_id',), name='re_pms_active_lease_unit_uidx'),
        ),
        migrations.AddIndex(
            model_name='realestatepmslease',
            index=models.Index(fields=('real_estate_id', 'status'), name='re_pms_lease_scope_idx'),
        ),
        migrations.AddIndex(
            model_name='realestatepmslease',
            index=models.Index(fields=('unit_id', 'status'), name='re_pms_lease_unit_idx'),
        ),
        migrations.AddIndex(
            model_name='realestatepmslease',
            index=models.Index(fields=('renter_assoc_id',), name='re_pms_lease_renter_idx'),
        ),
    ]
