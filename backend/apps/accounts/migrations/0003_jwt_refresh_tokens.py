from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):
    dependencies = [('accounts', '0002_auth_otp_and_kyc_status')]

    operations = [
        migrations.CreateModel(
            name='RefreshToken',
            fields=[
                ('jti', models.UUIDField(primary_key=True, serialize=False)),
                ('expires_at', models.DateTimeField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('revoked_at', models.DateTimeField(blank=True, null=True)),
                ('replaced_by', models.UUIDField(blank=True, null=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='refresh_tokens', to='accounts.profile')),
            ],
            options={'db_table': 'django_refresh_tokens'},
        ),
        migrations.AddIndex(model_name='refreshtoken', index=models.Index(fields=['user', 'revoked_at'], name='accounts_re_user_id_9a7c1b_idx')),
        migrations.AddIndex(model_name='refreshtoken', index=models.Index(fields=['expires_at'], name='accounts_re_expires_7d4c0d_idx')),
    ]
