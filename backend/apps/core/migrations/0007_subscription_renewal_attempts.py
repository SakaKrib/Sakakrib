from django.db import migrations, models
import uuid


class Migration(migrations.Migration):
    dependencies = [
        ('core', '0006_social_support_indexes'),
    ]

    operations = [
        migrations.CreateModel(
            name='SubscriptionRenewalAttempt',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('subscription_id', models.UUIDField()),
                ('attempt_day', models.IntegerField()),
                ('checkout_request_id', models.TextField(blank=True, null=True)),
                ('status', models.TextField(default='INITIATED')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('real_estate_subscription_id', models.UUIDField(blank=True, null=True)),
                ('payment_provider', models.TextField(blank=True, null=True)),
                ('provider_reference', models.TextField(blank=True, null=True)),
                ('provider_transaction_id', models.TextField(blank=True, null=True)),
                ('failure_reason', models.TextField(blank=True, null=True)),
                ('completed_at', models.DateTimeField(blank=True, null=True)),
            ],
            options={'db_table': 'subscription_renewal_attempts'},
        ),
        migrations.AddConstraint(
            model_name='subscriptionrenewalattempt',
            constraint=models.CheckConstraint(
                condition=models.Q(attempt_day__in=[1, 4]),
                name='renewal_attempt_day_check',
            ),
        ),
        migrations.AddConstraint(
            model_name='subscriptionrenewalattempt',
            constraint=models.CheckConstraint(
                condition=models.Q(status__in=['INITIATED', 'SENT', 'FAILED', 'PAID']),
                name='renewal_attempt_status_check',
            ),
        ),
        migrations.AddConstraint(
            model_name='subscriptionrenewalattempt',
            constraint=models.CheckConstraint(
                condition=(
                    (models.Q(subscription_id__isnull=False) & models.Q(real_estate_subscription_id__isnull=True))
                    | (models.Q(subscription_id__isnull=True) & models.Q(real_estate_subscription_id__isnull=False))
                ),
                name='subscription_renewal_attempts_owner_check',
            ),
        ),
        migrations.AddConstraint(
            model_name='subscriptionrenewalattempt',
            constraint=models.UniqueConstraint(
                fields=('subscription_id', 'attempt_day'),
                name='unique_subscription_renewal_day',
            ),
        ),
    ]
