import shutil
import tempfile

from django.test import TestCase, override_settings
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.accounts.models import Profile
from .community_media_views import CommunityPostMediaView
from .community_post_views import CommunityPostReactionView, CommunityPostV2View
from .domain_property import CommunityPost, CommunityPostMedia, CommunityPostReaction


class CommunityPostTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.owner = Profile.objects.create_user('owner@example.com', role='landlord')
        self.other = Profile.objects.create_user('other@example.com', role='renter')

    def request(self, view, method, user, data=None, **kwargs):
        request = getattr(self.factory, method)(f'/api/core/community-posts/{kwargs.get("post_id", "")}/', data or {}, format='json')
        force_authenticate(request, user=user)
        return view.as_view()(request, **kwargs)

    def test_all_four_roles_can_create_posts(self):
        for role in ('renter', 'landlord', 'mover', 'real_estate'):
            user = Profile.objects.create_user(f'{role}@example.com', role=role)
            response = self.request(CommunityPostV2View, 'post', user, {'content': f'{role} post', 'post_type': 'manual'})
            self.assertEqual(response.status_code, 201)
        self.assertEqual(CommunityPost.objects.count(), 4)

    def test_unapproved_role_cannot_create_post(self):
        admin = Profile.objects.create_user('admin@example.com', role='admin', is_admin=True)
        response = self.request(CommunityPostV2View, 'post', admin, {'content': 'blocked'})
        self.assertEqual(response.status_code, 403)

    def test_created_post_has_timestamp(self):
        response = self.request(CommunityPostV2View, 'post', self.owner, {'content': 'hello'})
        self.assertEqual(response.status_code, 201)
        post = CommunityPost.objects.get(pk=response.data['post']['id'])
        self.assertIsNotNone(post.created_at)

    def test_other_user_can_toggle_like_but_owner_cannot(self):
        post = CommunityPost.objects.create(user_id=self.owner.id, content='hello', post_type='manual')
        own = self.request(CommunityPostReactionView, 'post', self.owner, {'reaction_type': 'like'}, post_id=post.id)
        self.assertEqual(own.status_code, 400)
        other = self.request(CommunityPostReactionView, 'post', self.other, {'reaction_type': 'like'}, post_id=post.id)
        self.assertEqual(other.status_code, 200)
        self.assertEqual(other.data['reaction_count'], 1)
        again = self.request(CommunityPostReactionView, 'post', self.other, {'reaction_type': 'like'}, post_id=post.id)
        self.assertEqual(again.data['reaction_count'], 0)
        self.assertFalse(CommunityPostReaction.objects.filter(post_id=post.id).exists())


class CommunityMediaTests(TestCase):
    def setUp(self):
        self.media_root = tempfile.mkdtemp(prefix='sakakrib-community-')
        self.override = override_settings(MEDIA_ROOT=self.media_root)
        self.override.enable()
        self.factory = APIRequestFactory()
        self.user = Profile.objects.create_user('media@example.com', role='renter')
        self.post = CommunityPost.objects.create(user_id=self.user.id, content='with images', post_type='manual')

    def tearDown(self):
        self.override.disable()
        shutil.rmtree(self.media_root, ignore_errors=True)

    def upload(self, name='image.jpg'):
        request = self.factory.post('/api/core/community-posts/media/', {'file': SimpleUploadedFile(name, b'image-data', content_type='image/jpeg')}, format='multipart')
        force_authenticate(request, user=self.user)
        return CommunityPostMediaView.as_view()(request, post_id=self.post.id)

    def test_maximum_four_images(self):
        for index in range(4):
            response = self.upload(f'image-{index}.jpg')
            self.assertEqual(response.status_code, 201)
        fifth = self.upload('image-4.jpg')
        self.assertEqual(fifth.status_code, 400)
        self.assertEqual(CommunityPostMedia.objects.filter(post_id=self.post.id).count(), 4)

    def test_feed_returns_media_and_reaction_state(self):
        self.upload()
        request = self.factory.get('/api/core/community-posts/')
        force_authenticate(request, user=self.user)
        response = CommunityPostV2View.as_view()(request)
        self.assertEqual(response.status_code, 200)
        item = next(row for row in response.data['items'] if row['id'] == str(self.post.id))
        self.assertEqual(len(item['community_media']), 1)
        self.assertEqual(item['reaction_count'], 0)
        self.assertIsNone(item['user_reaction'])
