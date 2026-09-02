from django.db import migrations, models
from django.utils import timezone
from datetime import timedelta


def backfill_payment_intent_timestamps(apps, schema_editor):
    ListingPaymentIntent = apps.get_model('listings', 'ListingPaymentIntent')
    now = timezone.now()
    for intent in ListingPaymentIntent.objects.filter(expires_at__isnull=True).iterator():
        base = intent.created_at or now
        intent.expires_at = base + timedelta(minutes=15)
        if intent.created_at is None:
            intent.created_at = now
        if intent.updated_at is None:
            intent.updated_at = intent.created_at
        intent.save(update_fields=['expires_at', 'created_at', 'updated_at'])

    ListingPaymentIntent.objects.filter(created_at__isnull=True).update(created_at=now)
    ListingPaymentIntent.objects.filter(updated_at__isnull=True).update(updated_at=now)


class Migration(migrations.Migration):
    dependencies = [
        ('listings', '0004_payment_intent_indexes_and_idempotency'),
    ]

    operations = [
        migrations.RunPython(backfill_payment_intent_timestamps, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='listingpaymentintent',
            name='created_at',
            field=models.DateTimeField(auto_now_add=True),
        ),
        migrations.AlterField(
            model_name='listingpaymentintent',
            name='updated_at',
            field=models.DateTimeField(auto_now=True),
        ),
        migrations.AlterField(
            model_name='listingpaymentintent',
            name='expires_at',
            field=models.DateTimeField(default=timezone.now),
        ),
    ]
