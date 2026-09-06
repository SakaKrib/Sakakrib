from django.db import migrations, models
import uuid


class Migration(migrations.Migration):
    dependencies = [
        ('core', '0006_alter_communitypost_ai_caption_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='MovingFinancialDocument',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('booking_id', models.UUIDField()),
                ('payment_id', models.UUIDField(blank=True, null=True)),
                ('document_type', models.TextField()),
                ('document_number', models.TextField()),
                ('renter_id', models.UUIDField()),
                ('mover_id', models.UUIDField()),
                ('amount_kes', models.DecimalField(decimal_places=2, max_digits=14)),
                ('platform_fee_kes', models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ('mover_net_kes', models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ('currency', models.TextField(default='KES')),
                ('status', models.TextField(default='ISSUED')),
                ('payment_provider', models.TextField(blank=True, null=True)),
                ('provider_reference', models.TextField(blank=True, null=True)),
                ('provider_transaction_id', models.TextField(blank=True, null=True)),
                ('mover_name_snapshot', models.TextField(default='')),
                ('mover_phone_snapshot', models.TextField(blank=True, null=True)),
                ('vehicle_type_snapshot', models.TextField(blank=True, null=True)),
                ('number_plate_snapshot', models.TextField(blank=True, null=True)),
                ('mover_profile_photo_snapshot', models.TextField(blank=True, null=True)),
                ('issued_at', models.DateTimeField(auto_now_add=True)),
                ('paid_at', models.DateTimeField(blank=True, null=True)),
                ('released_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'db_table': 'moving_financial_documents',
            },
        ),
        migrations.AddConstraint(
            model_name='movingfinancialdocument',
            constraint=models.CheckConstraint(
                condition=models.Q(document_type__in=['RENTER_RECEIPT', 'MOVER_SETTLEMENT']),
                name='moving_financial_documents_type_check',
            ),
        ),
        migrations.AddConstraint(
            model_name='movingfinancialdocument',
            constraint=models.CheckConstraint(
                condition=models.Q(amount_kes__gte=0),
                name='moving_financial_documents_amount_check',
            ),
        ),
        migrations.AddConstraint(
            model_name='movingfinancialdocument',
            constraint=models.CheckConstraint(
                condition=models.Q(platform_fee_kes__gte=0),
                name='moving_financial_documents_platform_fee_check',
            ),
        ),
        migrations.AddConstraint(
            model_name='movingfinancialdocument',
            constraint=models.CheckConstraint(
                condition=models.Q(mover_net_kes__gte=0),
                name='moving_financial_documents_mover_net_check',
            ),
        ),
        migrations.AddConstraint(
            model_name='movingfinancialdocument',
            constraint=models.CheckConstraint(
                condition=models.Q(currency='KES'),
                name='moving_financial_documents_currency_check',
            ),
        ),
        migrations.AddConstraint(
            model_name='movingfinancialdocument',
            constraint=models.CheckConstraint(
                condition=models.Q(status__in=['ISSUED', 'PAID', 'HELD', 'RELEASED', 'REFUNDED', 'CANCELLED']),
                name='moving_financial_documents_status_check',
            ),
        ),
        migrations.AddConstraint(
            model_name='movingfinancialdocument',
            constraint=models.CheckConstraint(
                condition=models.Q(payment_provider__isnull=True)
                | models.Q(payment_provider__in=['MPESA', 'PAYPAL']),
                name='moving_financial_documents_provider_check',
            ),
        ),
        migrations.AddConstraint(
            model_name='movingfinancialdocument',
            constraint=models.UniqueConstraint(
                fields=['booking_id', 'document_type'],
                name='moving_financial_documents_booking_type_key',
            ),
        ),
        migrations.AddConstraint(
            model_name='movingfinancialdocument',
            constraint=models.UniqueConstraint(
                fields=['document_number'],
                name='moving_financial_documents_number_key',
            ),
        ),
    ]
