import uuid

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('core', '0001_booking_domain_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='Mover',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('user_id', models.UUIDField()),
                ('driver_full_name', models.TextField(default='')),
                ('national_id', models.TextField(default='')),
                ('dl_number', models.TextField(default='')),
                ('dl_photo_url', models.TextField(blank=True, default='', null=True)),
                ('vehicle_type', models.TextField(default='pickup')),
                ('number_plate', models.TextField(default='')),
                ('operating_city', models.TextField(default='')),
                ('operating_county', models.TextField(default='')),
                ('phone', models.TextField(default='')),
                ('profile_photo_url', models.TextField(blank=True, default='', null=True)),
                ('base_rate_kes', models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ('is_available', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(blank=True, null=True)),
                ('updated_at', models.DateTimeField(blank=True, null=True)),
                ('business_name', models.TextField(blank=True, default='', null=True)),
                ('working_days', models.JSONField(blank=True, default=list, null=True)),
                ('start_time', models.TimeField(blank=True, null=True)),
                ('end_time', models.TimeField(blank=True, null=True)),
                ('payment_channel', models.TextField(default='mpesa_send_money')),
                ('payment_account', models.TextField(default='')),
                ('liability_accepted', models.BooleanField(default=False)),
                ('reference_contacts', models.JSONField(default=list)),
                ('approval_status', models.TextField(default='pending_review')),
                ('rate_per_km_kes', models.DecimalField(blank=True, decimal_places=2, default=0, max_digits=14, null=True)),
                ('insurance_policy_details', models.TextField(blank=True, default='', null=True)),
                ('vehicle_inspection_expiry', models.DateField(blank=True, null=True)),
                ('terms_accepted', models.BooleanField(blank=True, default=False, null=True)),
                ('current_latitude', models.FloatField(blank=True, null=True)),
                ('current_longitude', models.FloatField(blank=True, null=True)),
                ('location_updated_at', models.DateTimeField(blank=True, null=True)),
                ('location', models.TextField(blank=True, null=True)),
                ('capacity_details', models.TextField(default='')),
            ],
            options={'db_table': 'movers'},
        ),
        migrations.CreateModel(
            name='PaymentWebhookEvent',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('provider', models.TextField()),
                ('event_id', models.TextField()),
                ('event_type', models.TextField()),
                ('status', models.TextField(default='RECEIVED')),
                ('received_at', models.DateTimeField(auto_now_add=True)),
                ('processed_at', models.DateTimeField(blank=True, null=True)),
                ('error', models.TextField(blank=True, null=True)),
                ('invoice_id', models.UUIDField(blank=True, null=True)),
                ('metadata', models.JSONField(default=dict)),
            ],
            options={'db_table': 'payment_webhook_events'},
        ),
        migrations.AddConstraint(
            model_name='mover',
            constraint=models.CheckConstraint(condition=models.Q(('vehicle_type__in', ['pickup', 'lorry', 'trailer'])), name='movers_vehicle_type_check'),
        ),
        migrations.AddConstraint(
            model_name='mover',
            constraint=models.CheckConstraint(condition=models.Q(('payment_channel__in', ['mpesa_send_money', 'mpesa_paybill', 'mpesa_lipa_na_mpesa', 'airtel_money'])), name='movers_payment_channel_check'),
        ),
        migrations.AddConstraint(
            model_name='mover',
            constraint=models.CheckConstraint(condition=models.Q(('approval_status__in', ['pending_review', 'approved', 'rejected'])), name='movers_approval_status_check'),
        ),
        migrations.AddConstraint(
            model_name='mover',
            constraint=models.CheckConstraint(condition=models.Q(current_latitude__isnull=True) | (models.Q(current_latitude__gte=-90) & models.Q(current_latitude__lte=90)), name='movers_current_latitude_range'),
        ),
        migrations.AddConstraint(
            model_name='mover',
            constraint=models.CheckConstraint(condition=models.Q(current_longitude__isnull=True) | (models.Q(current_longitude__gte=-180) & models.Q(current_longitude__lte=180)), name='movers_current_longitude_range'),
        ),
        migrations.AddConstraint(
            model_name='mover',
            constraint=models.UniqueConstraint(fields=('user_id',), name='movers_user_id_key'),
        ),
        migrations.AddConstraint(
            model_name='paymentwebhookevent',
            constraint=models.UniqueConstraint(fields=('provider', 'event_id'), name='payment_webhook_events_provider_event_id_key'),
        ),
        migrations.AddConstraint(
            model_name='paymentwebhookevent',
            constraint=models.CheckConstraint(condition=models.Q(('status__in', ['RECEIVED', 'PROCESSING', 'PROCESSED', 'IGNORED', 'FAILED'])), name='payment_webhook_events_status_check'),
        ),
    ]
