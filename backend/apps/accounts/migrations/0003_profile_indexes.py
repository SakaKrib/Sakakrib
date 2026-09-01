from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('accounts', '0002_profile_signup_verification_state'),
    ]

    operations = [
        migrations.AddIndex(
            model_name='profile',
            index=models.Index(fields=['role'], name='profiles_role_idx'),
        ),
        migrations.AddIndex(
            model_name='profile',
            index=models.Index(fields=['verification_status'], name='profiles_verif_idx'),
        ),
        migrations.AddIndex(
            model_name='profile',
            index=models.Index(fields=['kyc_status'], name='profiles_kyc_idx'),
        ),
    ]
