from unittest.mock import Mock, patch
from uuid import uuid4

from django.test import SimpleTestCase

from .review_services import review_listing


class ListingApprovalWorkflowTests(SimpleTestCase):
    @patch('apps.listings.review_services.dispatch_user_notification')
    @patch('apps.listings.review_services.CommunityPost.objects')
    @patch('apps.listings.review_services.Listing.objects')
    @patch('apps.listings.review_services.require_admin')
    def test_approval_synchronizes_all_publication_state(
        self, require_admin, listing_manager, community_manager, dispatch_notification
    ):
        listing = Mock()
        listing.id = uuid4()
        listing.approval_status = 'pending'
        listing.is_approved = False
        listing.status = 'pending'
        listing.is_published = False
        listing.ai_caption = ''
        listing.title = 'Approved Property'
        listing.city = 'Nairobi'
        listing.county = 'Nairobi'
        listing.price_kes = 25000
        listing.listing_type = 'rent'
        listing.description = 'A test listing'
        listing.user_id = uuid4()
        listing.user = None
        listing.admin_reviewed_at = None
        listing.admin_review_note = ''
        listing_manager.select_for_update.return_value.get.return_value = listing
        community_manager.filter.return_value.order_by.return_value.first.return_value = None

        result = review_listing(Mock(), listing.id, 'approved', 'Looks good')

        self.assertIs(result, listing)
        self.assertEqual(listing.approval_status, 'approved')
        self.assertTrue(listing.is_approved)
        self.assertEqual(listing.status, 'approved')
        self.assertTrue(listing.is_published)
        self.assertEqual(listing.admin_review_note, 'Looks good')
        listing.save.assert_called_once()
        community_manager.create.assert_called_once()
        dispatch_notification.assert_not_called()

    @patch('apps.listings.review_services.dispatch_user_notification')
    @patch('apps.listings.review_services.CommunityPost.objects')
    @patch('apps.listings.review_services.Listing.objects')
    @patch('apps.listings.review_services.require_admin')
    def test_rejection_synchronizes_all_private_state(
        self, require_admin, listing_manager, community_manager, dispatch_notification
    ):
        listing = Mock()
        listing.id = uuid4()
        listing.approval_status = 'pending'
        listing.is_approved = False
        listing.status = 'pending'
        listing.is_published = False
        listing.admin_reviewed_at = None
        listing.admin_review_note = ''
        listing_manager.select_for_update.return_value.get.return_value = listing

        result = review_listing(Mock(), listing.id, 'rejected', 'Needs correction')

        self.assertIs(result, listing)
        self.assertEqual(listing.approval_status, 'rejected')
        self.assertFalse(listing.is_approved)
        self.assertEqual(listing.status, 'rejected')
        self.assertFalse(listing.is_published)
        self.assertEqual(listing.admin_review_note, 'Needs correction')
        listing.save.assert_called_once()
        community_manager.create.assert_not_called()
        dispatch_notification.assert_not_called()
