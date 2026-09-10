from datetime import datetime
from unittest.mock import Mock, patch
from uuid import uuid4

from django.test import TestCase

from .review_services import review_listing


class ListingApprovalCommunityPostTests(TestCase):
    def make_listing(self):
        listing = Mock()
        listing.id = uuid4()
        listing.user_id = uuid4()
        listing.ai_caption = 'AI-generated listing caption'
        listing.approval_status = 'pending_review'
        listing.is_published = False
        listing.title = 'Test listing'
        listing.city = 'Nairobi'
        listing.county = 'Nairobi'
        listing.user = Mock(full_name='Test User')
        return listing

    @patch('apps.listings.review_services.dispatch_user_notification')
    @patch('apps.listings.review_services.timezone.now')
    @patch('apps.listings.review_services.CommunityPost.objects')
    @patch('apps.listings.review_services.Listing.objects')
    @patch('apps.listings.review_services.require_admin')
    def test_approval_uses_existing_ai_caption_and_repairs_missing_created_at(
        self, require_admin, listing_manager, post_manager, now, dispatch_notification
    ):
        listing = self.make_listing()
        post = Mock(created_at=None, listing_id=listing.id)
        post_manager.filter.return_value.order_by.return_value.first.return_value = post
        listing_manager.select_for_update.return_value.get.return_value = listing
        reviewed_at = datetime(2026, 9, 10, 8, 0, 0)
        now.return_value = reviewed_at

        with self.captureOnCommitCallbacks(execute=True):
            result = review_listing(Mock(), listing.id, 'approved')

        self.assertIs(result, listing)
        self.assertEqual(post.content, listing.ai_caption)
        self.assertEqual(post.ai_caption, listing.ai_caption)
        self.assertEqual(post.post_type, 'listing')
        self.assertEqual(post.created_at, reviewed_at)
        post.save.assert_called_once_with(
            update_fields=['listing_id', 'user_id', 'content', 'ai_caption', 'post_type', 'created_at']
        )
        post_manager.create.assert_not_called()
        dispatch_notification.assert_called_once()

    @patch('apps.listings.review_services.dispatch_user_notification')
    @patch('apps.listings.review_services.timezone.now')
    @patch('apps.listings.review_services.CommunityPost.objects')
    @patch('apps.listings.review_services.Listing.objects')
    @patch('apps.listings.review_services.require_admin')
    def test_approval_repairs_orphan_community_post(
        self, require_admin, listing_manager, post_manager, now, dispatch_notification
    ):
        listing = self.make_listing()
        linked_qs = Mock()
        orphan_qs = Mock()
        orphan = Mock(created_at=None, listing_id=None)
        linked_qs.order_by.return_value.first.return_value = None
        orphan_qs.order_by.return_value.first.return_value = orphan
        post_manager.filter.side_effect = [linked_qs, orphan_qs]
        listing_manager.select_for_update.return_value.get.return_value = listing
        reviewed_at = datetime(2026, 9, 10, 8, 0, 0)
        now.return_value = reviewed_at

        with self.captureOnCommitCallbacks(execute=True):
            review_listing(Mock(), listing.id, 'approved')

        self.assertEqual(orphan.listing_id, listing.id)
        self.assertEqual(orphan.content, listing.ai_caption)
        self.assertEqual(orphan.ai_caption, listing.ai_caption)
        self.assertEqual(orphan.post_type, 'listing')
        self.assertEqual(orphan.created_at, reviewed_at)
        orphan.save.assert_called_once_with(
            update_fields=['listing_id', 'user_id', 'content', 'ai_caption', 'post_type', 'created_at']
        )
        post_manager.create.assert_not_called()
        dispatch_notification.assert_called_once()

    @patch('apps.listings.review_services.dispatch_user_notification')
    @patch('apps.listings.review_services.timezone.now')
    @patch('apps.listings.review_services.CommunityPost.objects')
    @patch('apps.listings.review_services.Listing.objects')
    @patch('apps.listings.review_services.require_admin')
    def test_approval_creates_linked_community_post_with_existing_ai_caption(
        self, require_admin, listing_manager, post_manager, now, dispatch_notification
    ):
        listing = self.make_listing()
        linked_qs = Mock()
        orphan_qs = Mock()
        linked_qs.order_by.return_value.first.return_value = None
        orphan_qs.order_by.return_value.first.return_value = None
        post_manager.filter.side_effect = [linked_qs, orphan_qs]
        listing_manager.select_for_update.return_value.get.return_value = listing
        reviewed_at = datetime(2026, 9, 10, 8, 0, 0)
        now.return_value = reviewed_at

        with self.captureOnCommitCallbacks(execute=True):
            review_listing(Mock(), listing.id, 'approved')

        post_manager.create.assert_called_once_with(
            listing_id=listing.id,
            created_at=reviewed_at,
            user_id=listing.user_id,
            content=listing.ai_caption,
            ai_caption=listing.ai_caption,
            post_type='listing',
        )
        dispatch_notification.assert_called_once()

    @patch('apps.listings.review_services.CommunityPost.objects')
    @patch('apps.listings.review_services.Listing.objects')
    @patch('apps.listings.review_services.require_admin')
    def test_approval_does_not_generate_fallback_caption(
        self, require_admin, listing_manager, post_manager
    ):
        listing = self.make_listing()
        listing.ai_caption = ''
        listing_manager.select_for_update.return_value.get.return_value = listing

        with self.assertRaisesRegex(ValueError, 'AI caption before approval'):
            review_listing(Mock(), listing.id, 'approved')

        post_manager.filter.assert_not_called()
        post_manager.create.assert_not_called()
