from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ('accounts', '0004_refresh_tokens'),
        ('listings', '0004_payment_intent_indexes_and_idempotency'),
        ('payments', '0001_initial'),
    ]

    operations = [
        migrations.RemoveField(model_name='listingpayment', name='payment_intent_id'),
        migrations.RemoveField(model_name='listingpayment', name='provider_transaction_id'),
        migrations.RemoveField(model_name='listingpayment', name='updated_at'),
        migrations.RenameField(model_name='listingpayment', old_name='user_id', new_name='user'),
        migrations.RenameField(model_name='listingpayment', old_name='listing_id', new_name='listing'),
        migrations.AlterField(model_name='listingpayment', name='user', field=models.ForeignKey(db_column='user_id', on_delete=django.db.models.deletion.PROTECT, related_name='listing_payments', to='accounts.profile')),
        migrations.AlterField(model_name='listingpayment', name='listing', field=models.ForeignKey(db_column='listing_id', on_delete=django.db.models.deletion.PROTECT, related_name='listing_payments', to='listings.listing')),
        migrations.AlterField(model_name='listingpayment', name='amount_kes', field=models.DecimalField(decimal_places=2, default=1000, max_digits=14)),
        migrations.AlterField(model_name='listingpayment', name='created_at', field=models.DateTimeField(auto_now_add=True)),
        migrations.AddConstraint(model_name='listingpayment', constraint=models.CheckConstraint(condition=models.Q(amount_kes__gt=0), name='listing_payments_amount_check')),
        migrations.AddConstraint(model_name='listingpayment', constraint=models.CheckConstraint(condition=models.Q(amount_kes=1000), name='listing_payments_amount_fixed_check')),
        migrations.AddConstraint(model_name='listingpayment', constraint=models.CheckConstraint(condition=models.Q(status__in=['PENDING', 'PAID', 'FAILED', 'CANCELLED']), name='listing_payments_status_check')),
        migrations.AddConstraint(model_name='listingpayment', constraint=models.CheckConstraint(condition=models.Q(payment_provider__isnull=True) | models.Q(payment_provider__in=['MPESA', 'PAYPAL']), name='listing_payments_provider_check')),
        migrations.AddConstraint(model_name='listingpayment', constraint=models.CheckConstraint(condition=models.Q(payment_method__isnull=True) | models.Q(payment_method__in=['MPESA', 'PAYPAL']), name='listing_payments_method_check')),
        migrations.AddConstraint(model_name='listingpayment', constraint=models.UniqueConstraint(fields=['checkout_request_id'], name='listing_payments_checkout_request_id_key')),
        migrations.AddConstraint(model_name='listingpayment', constraint=models.UniqueConstraint(fields=['provider_reference'], name='listing_payments_provider_reference_key')),
    ]
