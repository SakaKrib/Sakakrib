import django.utils.timezone
import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0013_property_unit_sale_pricing'),
    ]

    operations = [
        migrations.CreateModel(
            name='SalePaymentRecord',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('owner_id', models.UUIDField()),
                ('listing_id', models.UUIDField()),
                ('unit_id', models.UUIDField()),
                ('buyer_name', models.TextField()),
                ('buyer_phone', models.TextField(blank=True, default='')),
                ('amount_kes', models.DecimalField(decimal_places=2, max_digits=14)),
                ('payment_method', models.TextField(blank=True, default='')),
                ('transaction_reference', models.TextField(blank=True, default='')),
                ('payment_date', models.DateField()),
                ('note', models.TextField(blank=True, default='')),
                ('recorded_by', models.UUIDField(blank=True, null=True)),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now)),
            ],
            options={'db_table': 'sale_payment_records', 'ordering': ['-payment_date', '-created_at']},
        ),
    ]
