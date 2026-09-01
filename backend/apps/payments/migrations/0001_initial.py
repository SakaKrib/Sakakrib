import uuid

from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name='ListingPayment',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('user_id', models.UUIDField()),
                ('listing_id', models.UUIDField(blank=True, null=True)),
                ('payment_intent_id', models.UUIDField(blank=True, null=True)),
                ('amount_kes', models.DecimalField(decimal_places=2, max_digits=14)),
                ('status', models.TextField(default='PENDING')),
                ('payment_provider', models.TextField(blank=True, null=True)),
                ('payment_method', models.TextField(blank=True, null=True)),
                ('provider_reference', models.TextField(blank=True, null=True)),
                ('provider_transaction_id', models.TextField(blank=True, null=True)),
                ('checkout_request_id', models.TextField(blank=True, null=True)),
                ('merchant_request_id', models.TextField(blank=True, null=True)),
                ('mpesa_receipt', models.TextField(blank=True, null=True)),
                ('phone_number', models.TextField(blank=True, null=True)),
                ('provider_amount', models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True)),
                ('provider_currency', models.TextField(blank=True, null=True)),
                ('paypal_order_id', models.TextField(blank=True, null=True)),
                ('paypal_fx_rate', models.DecimalField(blank=True, decimal_places=8, max_digits=18, null=True)),
                ('result_code', models.IntegerField(blank=True, null=True)),
                ('result_description', models.TextField(blank=True, null=True)),
                ('created_at', models.DateTimeField(blank=True, null=True)),
                ('paid_at', models.DateTimeField(blank=True, null=True)),
                ('updated_at', models.DateTimeField(blank=True, null=True)),
            ],
            options={'db_table': 'listing_payments'},
        ),
    ]
