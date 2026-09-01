# Generated manually to establish the Django-native user model before the first database migration.
from django.db import migrations, models
import django.utils.timezone
import uuid
from django.contrib.auth.models import Group, Permission


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        ('auth', '0012_alter_user_first_name_max_length'),
    ]

    operations = [
        migrations.CreateModel(
            name='Profile',
            fields=[
                ('password', models.CharField(max_length=128, verbose_name='password')),
                ('last_login', models.DateTimeField(blank=True, null=True, verbose_name='last login')),
                ('is_superuser', models.BooleanField(default=False, help_text='Designates that this user has all permissions without explicitly assigning them.', verbose_name='superuser status')),
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('email', models.EmailField(max_length=254, unique=True)),
                ('full_name', models.CharField(blank=True, default='', max_length=255)),
                ('first_name', models.CharField(blank=True, default='', max_length=150)),
                ('last_name', models.CharField(blank=True, default='', max_length=150)),
                ('middle_name', models.CharField(blank=True, default='', max_length=150)),
                ('role', models.CharField(blank=True, default='renter', max_length=50)),
                ('is_admin', models.BooleanField(default=False)),
                ('kyc_completed', models.BooleanField(default=False)),
                ('verification_status', models.CharField(default='pending_verification', max_length=50)),
                ('landlord_application_status', models.CharField(default='not_requested', max_length=50)),
                ('real_estate_application_status', models.CharField(default='not_requested', max_length=50)),
                ('mover_application_status', models.CharField(default='not_requested', max_length=50)),
                ('national_id', models.CharField(blank=True, default='', max_length=100)),
                ('dl_number', models.CharField(blank=True, default='', max_length=100)),
                ('phone', models.CharField(blank=True, default='', max_length=50)),
                ('profile_photo_url', models.TextField(blank=True, default='')),
                ('id_photo_url', models.TextField(blank=True, default='')),
                ('selfie_url', models.TextField(blank=True, default='')),
                ('id_document_url', models.TextField(blank=True, default='')),
                ('id_document_type', models.CharField(blank=True, default='', max_length=30)),
                ('city', models.CharField(blank=True, default='', max_length=150)),
                ('county', models.CharField(blank=True, default='', max_length=150)),
                ('is_agency', models.BooleanField(default=False)),
                ('free_listings_used', models.PositiveIntegerField(default=0)),
                ('email_verified', models.BooleanField(default=False)),
                ('admin_review_note', models.TextField(blank=True, default='')),
                ('is_active', models.BooleanField(default=True)),
                ('is_staff', models.BooleanField(default=False)),
                ('date_joined', models.DateTimeField(auto_now_add=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('groups', models.ManyToManyField(blank=True, help_text='The groups this user belongs to. A user will get all permissions granted to each of their groups.', related_name='profile_set', related_query_name='profile', to='auth.group', verbose_name='groups')),
                ('user_permissions', models.ManyToManyField(blank=True, help_text='Specific permissions for this user.', related_name='profile_set', related_query_name='profile', to='auth.permission', verbose_name='user permissions')),
            ],
            options={
                'db_table': 'profiles',
                'ordering': ['-created_at'],
            },
        ),
    ]
