from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ('accounts', '0002_role_optional'),
    ]

    operations = [
        migrations.CreateModel(
            name='PushDeviceToken',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('token', models.TextField(unique=True)),
                ('platform', models.CharField(default='android', max_length=20)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('last_registered_at', models.DateTimeField(auto_now=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='push_device_tokens', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'push_device_tokens',
            },
        ),
        migrations.AddIndex(
            model_name='pushdevicetoken',
            index=models.Index(fields=['user', 'is_active'], name='push_device_user_active_idx'),
        ),
    ]
