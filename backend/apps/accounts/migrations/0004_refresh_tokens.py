import uuid

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ('accounts', '0003_profile_indexes'),
    ]

    operations = [
        migrations.CreateModel(
            name='RefreshToken',
            fields=[
                ('jti', models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ('expires_at', models.DateTimeField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('revoked_at', models.DateTimeField(blank=True, null=True)),
                ('replaced_by', models.UUIDField(blank=True, null=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='refresh_tokens', to='accounts.profile')),
            ],
            options={'db_table': 'django_refresh_tokens'},
        ),
        migrations.AddIndex(
            model_name='refreshtoken',
            index=models.Index(fields=['user', 'revoked_at'], name='django_refr_user_id_4f31b0_idx'),
        ),
        migrations.AddIndex(
            model_name='refreshtoken',
            index=models.Index(fields=['expires_at'], name='django_refr_expires_6a2f44_idx'),
        ),
    ]
