from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import Profile

from .models import Listing


class HomepageFeaturedListingsTests(TestCase):
    def setUp(self):
        self.owner = Profile.objects.create_user(
            email='featured-owner@example.com',
            password='A-strong-password-123',
            email_verified=True,
            role='landlord',
            landlord_application_status='approved',
            kyc_completed=True,
            verification_status='verified',
        )
        self.viewer = Profile.objects.create_user(
            email='featured-viewer@example.com',
            password='A-strong-password-123',
            email_verified=True,
            role='renter',
        )

    def make_listing(self, *, title, approval_status, is_published, is_approved=False):
        return Listing.objects.create(
            user=self.owner,
            title=title,
            city='Nairobi',
            county='Nairobi',
            price_kes=25000,
            listing_type='rent',
            approval_status=approval_status,
            is_published=is_published,
            is_approved=is_approved,
            status='approved' if approval_status == 'approved' else 'pending',
        )

    def test_featured_listings_match_public_view_all_criteria(self):
        visible_but_legacy_flag_false = self.make_listing(
            title='Approved and published',
            approval_status='approved',
            is_published=True,
            is_approved=False,
        )
        self.make_listing(
            title='Pending review',
            approval_status='pending_review',
            is_published=False,
        )
        self.make_listing(
            title='Approved but unpublished',
            approval_status='approved',
            is_published=False,
        )

        featured_response = APIClient().get(reverse('listing-featured'))
        self.assertEqual(featured_response.status_code, 200)

        viewer_client = APIClient()
        viewer_client.force_authenticate(user=self.viewer)
        listings_response = viewer_client.get(reverse('listing-list'))
        self.assertEqual(listings_response.status_code, 200)

        featured_ids = {item['id'] for item in featured_response.data['results']}
        marketplace_ids = {item['id'] for item in listings_response.data['results']}
        self.assertEqual(featured_ids, marketplace_ids)
        self.assertIn(str(visible_but_legacy_flag_false.id), featured_ids)

    def test_featured_listings_filter_by_city_and_listing_type(self):
        nairobi_rent = self.make_listing(
            title='Nairobi rental',
            approval_status='approved',
            is_published=True,
        )
        nairobi_rent.city = 'Nairobi'
        nairobi_rent.save(update_fields=['city'])

        sale = self.make_listing(
            title='Nairobi sale',
            approval_status='approved',
            is_published=True,
        )
        sale.city = 'Nairobi'
        sale.listing_type = 'sale'
        sale.save(update_fields=['city', 'listing_type'])

        mombasa_rent = self.make_listing(
            title='Mombasa rental',
            approval_status='approved',
            is_published=True,
        )
        mombasa_rent.city = 'Mombasa'
        mombasa_rent.save(update_fields=['city'])

        response = APIClient().get(
            reverse('listing-featured'),
            {'city': 'Nairobi', 'listing_type': 'sale'},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            [item['id'] for item in response.data['results']],
            [str(sale.id)],
        )
        self.assertNotIn(str(nairobi_rent.id), {item['id'] for item in response.data['results']})
        self.assertNotIn(str(mombasa_rent.id), {item['id'] for item in response.data['results']})

    def test_homepage_listing_stat_counts_same_public_listing_set(self):
        self.make_listing(
            title='Approved and published',
            approval_status='approved',
            is_published=True,
            is_approved=False,
        )
        self.make_listing(
            title='Pending review',
            approval_status='pending_review',
            is_published=False,
        )

        response = APIClient().get(reverse('homepage-stats'))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['listings'], 1)
