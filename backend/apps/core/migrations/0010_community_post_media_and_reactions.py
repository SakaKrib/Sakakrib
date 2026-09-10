from django.db import migrations, models
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0009_moving_journey_phase'),
    ]

    operations = [
        migrations.CreateModel(
            name='CommunityPostMedia',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('post_id', models.UUIDField()),
                ('user_id', models.UUIDField()),
                ('storage_path', models.TextField()),
                ('url', models.TextField()),
                ('label', models.TextField(default='')),
                ('media_type', models.TextField(default='photo')),
                ('position', models.IntegerField(default=0)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'db_table': 'community_post_media',
                'indexes': [models.Index(fields=['post_id', 'position'], name='community_p_media_post_id_3f5a0c_idx')],
                'constraints': [models.UniqueConstraint(fields=('post_id', 'position'), name='community_post_media_post_position_uniq')],
            },
        ),
        migrations.CreateModel(
            name='CommunityPostReaction',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('post_id', models.UUIDField()),
                ('user_id', models.UUIDField()),
                ('reaction_type', models.TextField(default='like')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'db_table': 'community_post_reactions',
                'indexes': [models.Index(fields=['post_id'], name='community_p_rea_post_id_2f2d15_idx'), models.Index(fields=['user_id'], name='community_p_rea_user_id_4a6a95_idx')],
                'constraints': [models.UniqueConstraint(fields=('post_id', 'user_id'), name='community_post_reactions_post_user_uniq')],
            },
        ),
    ]
