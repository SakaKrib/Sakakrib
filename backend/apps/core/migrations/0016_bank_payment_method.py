from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0015_maintenance_requests'),
    ]

    operations = [
        migrations.AddField(model_name='landlordpaymentmethod', name='bank_name', field=models.TextField(blank=True, null=True)),
        migrations.AddField(model_name='landlordpaymentmethod', name='bank_account_name', field=models.TextField(blank=True, null=True)),
        migrations.AddField(model_name='landlordpaymentmethod', name='bank_account_number', field=models.TextField(blank=True, null=True)),
        migrations.AddField(model_name='landlordpaymentmethod', name='bank_branch', field=models.TextField(blank=True, null=True)),
    ]
