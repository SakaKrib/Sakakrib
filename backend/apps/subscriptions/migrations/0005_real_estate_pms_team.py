from django.db import migrations, models
import uuid


class Migration(migrations.Migration):
    dependencies = [
        ('subscriptions', '0004_add_upgrade_invoice_fields'),
    ]

    operations = [
        migrations.CreateModel(
            name='RealEstatePMSMember',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('real_estate_id', models.UUIDField()),
                ('user_id', models.UUIDField()),
                ('role', models.TextField(choices=[('TEAM_MANAGER', 'Team Manager'), ('AGENT', 'Agent')], default='AGENT')),
                ('status', models.TextField(choices=[('ACTIVE', 'Active'), ('SUSPENDED', 'Suspended')], default='ACTIVE')),
                ('created_at', models.DateTimeField()),
                ('updated_at', models.DateTimeField()),
            ],
            options={
                'db_table': 'real_estate_pms_members',
            },
        ),
        migrations.CreateModel(
            name='RealEstatePMSListingAssignment',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('real_estate_id', models.UUIDField()),
                ('listing_id', models.UUIDField()),
                ('agent_id', models.UUIDField()),
                ('assigned_by_id', models.UUIDField()),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField()),
                ('updated_at', models.DateTimeField()),
            ],
            options={
                'db_table': 'real_estate_pms_listing_assignments',
            },
        ),
        migrations.AddConstraint(
            model_name='realestatepmsmember',
            constraint=models.UniqueConstraint(fields=('real_estate_id', 'user_id'), name='realestate_pms_member_uidx'),
        ),
        migrations.AddIndex(
            model_name='realestatepmsmember',
            index=models.Index(fields=('real_estate_id', 'status'), name='re_pms_member_scope_idx'),
        ),
        migrations.AddIndex(
            model_name='realestatepmsmember',
            index=models.Index(fields=('user_id', 'status'), name='re_pms_member_user_idx'),
        ),
        migrations.AddConstraint(
            model_name='realestatepmslistingassignment',
            constraint=models.UniqueConstraint(fields=('real_estate_id', 'listing_id', 'agent_id'), name='re_pms_listing_agent_uidx'),
        ),
        migrations.AddIndex(
            model_name='realestatepmslistingassignment',
            index=models.Index(fields=('real_estate_id', 'is_active'), name='re_pms_assign_scope_idx'),
        ),
        migrations.AddIndex(
            model_name='realestatepmslistingassignment',
            index=models.Index(fields=('agent_id', 'is_active'), name='re_pms_assign_agent_idx'),
        ),
    ]