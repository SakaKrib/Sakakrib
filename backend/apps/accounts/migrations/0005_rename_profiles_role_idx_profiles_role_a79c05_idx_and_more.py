import uuid

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('accounts', '0004_refresh_tokens'),
    ]

    operations = [
        migrations.RenameIndex(
            model_name='profile',
            new_name='profiles_role_a79c05_idx',
            old_name='profiles_role_idx',
        ),
        migrations.RenameIndex(
            model_name='profile',
            new_name='profiles_verific_7afbb0_idx',
            old_name='profiles_verif_idx',
        ),
        migrations.RenameIndex(
            model_name='profile',
            new_name='profiles_kyc_sta_664430_idx',
            old_name='profiles_kyc_idx',
        ),
        migrations.RenameIndex(
            model_name='refreshtoken',
            new_name='django_refr_user_id_26df20_idx',
            old_name='django_refr_user_id_4f31b0_idx',
        ),
        migrations.RenameIndex(
            model_name='refreshtoken',
            new_name='django_refr_expires_c21f01_idx',
            old_name='django_refr_expires_6a2f44_idx',
        ),
        migrations.AddField(
            model_name='profile',
            name='google_subject',
            field=models.CharField(blank=True, max_length=255, null=True, unique=True),
        ),
        migrations.AlterField(
            model_name='profile',
            name='groups',
            field=models.ManyToManyField(
                blank=True,
                help_text='The groups this user belongs to. A user will get all permissions granted to each of their groups.',
                related_name='user_set',
                related_query_name='user',
                to='auth.group',
                verbose_name='groups',
            ),
        ),
        migrations.AlterField(
            model_name='profile',
            name='role',
            field=models.CharField(default='renter', max_length=50),
        ),
        migrations.AlterField(
            model_name='profile',
            name='user_permissions',
            field=models.ManyToManyField(
                blank=True,
                help_text='Specific permissions for this user.',
                related_name='user_set',
                related_query_name='user',
                to='auth.permission',
                verbose_name='user permissions',
            ),
        ),
        migrations.AlterField(
            model_name='profile',
            name='verification_status',
            field=models.CharField(default='pending_verification', max_length=50),
        ),
        migrations.AlterField(
            model_name='refreshtoken',
            name='jti',
            field=models.UUIDField(primary_key=True, serialize=False),
        ),
    ]
