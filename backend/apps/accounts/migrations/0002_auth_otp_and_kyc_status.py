from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('accounts', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='profile',
            name='kyc_status',
            field=models.CharField(default='pending', max_length=50),
        ),
        migrations.AddField(
            model_name='profile',
            name='role_selected_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='profile',
            name='signup_otp_hash',
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='profile',
            name='signup_otp_expires_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='profile',
            name='signup_otp_attempts',
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='profile',
            name='signup_otp_last_sent_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='profile',
            name='signup_otp_verified_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='profile',
            name='signup_otp_encrypted',
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='profile',
            name='signup_otp_trial_count',
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='profile',
            name='signup_verification_started_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='profile',
            name='signup_verification_deadline_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name='profile',
            name='date_joined',
            field=models.DateTimeField(default=models.functions.Now),
        ),
    ]
