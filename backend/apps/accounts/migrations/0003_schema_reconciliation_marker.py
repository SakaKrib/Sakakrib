from django.db import migrations


class Migration(migrations.Migration):
    """Marker migration for the Supabase-to-Django schema reconciliation phase."""

    dependencies = [
        ("accounts", "0002_profile_signup_verification_state"),
    ]

    operations = []
