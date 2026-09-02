from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('subscriptions', '0001_initial')]

    operations = [
        migrations.AlterField(model_name='subscriptionlisting', name='subscription_id', field=models.UUIDField(blank=True, null=True)),
        migrations.AddConstraint(model_name='landlordsubscription', constraint=models.UniqueConstraint(condition=models.Q(status='PENDING_PAYMENT'), fields=('landlord_id',), name='landlord_sub_pending_uidx')),
        migrations.AddConstraint(model_name='landlordsubscription', constraint=models.UniqueConstraint(condition=models.Q(status__in=['ACTIVE', 'GRACE_PERIOD']), fields=('landlord_id',), name='landlord_sub_current_uidx')),
        migrations.AddConstraint(model_name='landlordsubscription', constraint=models.UniqueConstraint(condition=models.Q(paypal_subscription_id__isnull=False), fields=('paypal_subscription_id',), name='landlord_sub_paypal_uidx')),
        migrations.AddConstraint(model_name='realestatesubscription', constraint=models.UniqueConstraint(condition=models.Q(status='PENDING_PAYMENT'), fields=('real_estate_id',), name='realestate_sub_pending_uidx')),
        migrations.AddConstraint(model_name='realestatesubscription', constraint=models.UniqueConstraint(condition=models.Q(status__in=['ACTIVE', 'GRACE_PERIOD']), fields=('real_estate_id',), name='realestate_sub_current_uidx')),
        migrations.AddConstraint(model_name='realestatesubscription', constraint=models.UniqueConstraint(condition=models.Q(paypal_subscription_id__isnull=False), fields=('paypal_subscription_id',), name='realestate_sub_paypal_uidx')),
        migrations.AddConstraint(model_name='subscriptionlisting', constraint=models.UniqueConstraint(condition=models.Q(subscription_id__isnull=False), fields=('subscription_id', 'listing_id'), name='subscription_listing_landlord_uidx')),
        migrations.AddConstraint(model_name='subscriptionlisting', constraint=models.UniqueConstraint(condition=models.Q(real_estate_subscription_id__isnull=False), fields=('real_estate_subscription_id', 'listing_id'), name='subscription_listing_re_uidx')),
        migrations.AddConstraint(model_name='subscriptioninvoice', constraint=models.UniqueConstraint(condition=models.Q(checkout_request_id__isnull=False), fields=('checkout_request_id',), name='subscription_invoice_checkout_uidx')),
        migrations.AddConstraint(model_name='subscriptioninvoice', constraint=models.UniqueConstraint(condition=models.Q(provider_reference__isnull=False), fields=('provider_reference',), name='subscription_invoice_provider_ref_uidx')),
        migrations.AddConstraint(model_name='subscriptioninvoice', constraint=models.UniqueConstraint(condition=models.Q(paypal_subscription_id__isnull=False), fields=('paypal_subscription_id',), name='subscription_invoice_paypal_sub_uidx')),
    ]
