from datetime import timedelta

from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import Profile
from apps.listings.draft_finalization import finalize_listing_draft
from apps.listings.draft_services import save_listing_draft
from apps.listings.models import Listing, ListingPaymentIntent


class ListingDraftWorkflowTests(APITestCase):
    def make_profile(self, role):
        return Profile.objects.create(
            role=role,
            email=f'{role}-{role}@example.com',
            full_name=role.title(),
            verification_status='verified',
            kyc_completed=True,
            landlord_application_status='approved' if role == 'landlord' else 'pending',
            real_estate_application_status='approved' if role == 'real_estate' else 'pending',
            free_listings_used=0,
        )

    def test_landlord_draft_is_owned_by_landlord_and_keeps_listing_id(self):
        profile = self.make_profile('landlord')
        draft = save_listing_draft(profile, {'title': 'Landlord Draft', 'city': 'Nairobi'})
        self.assertTrue(draft.is_draft)
        self.assertEqual(draft.user_id, profile.id)
        self.assertEqual(str(draft.id), str(draft.id))

        result = finalize_listing_draft(profile, draft.id)
        draft.refresh_from_db()
        self.assertTrue(result['listing_created'])
        self.assertEqual(result['listing_id'], draft.id)
        self.assertFalse(draft.is_draft)
        profile.refresh_from_db()
        self.assertEqual(profile.free_listings_used, 1)

    def test_real_estate_draft_is_owned_by_real_estate_and_can_finalize(self):
        profile = self.make_profile('real_estate')
        draft = save_listing_draft(profile, {'title': 'Agency Draft', 'city': 'Mombasa'})
        result = finalize_listing_draft(profile, draft.id)
        draft.refresh_from_db()
        self.assertEqual(result['listing_id'], draft.id)
        self.assertFalse(draft.is_draft)
        self.assertEqual(draft.user_id, profile.id)

    def test_other_user_cannot_finalize_draft(self):
        owner = self.make_profile('landlord')
        other = self.make_profile('real_estate')
        draft = save_listing_draft(owner, {'title': 'Private Draft'})
        with self.assertRaises(Exception):
            finalize_listing_draft(other, draft.id)

    def test_paid_intent_must_belong_to_same_draft(self):
        profile = self.make_profile('landlord')
        draft = save_listing_draft(profile, {'title': 'Paid Draft'})
        intent = ListingPaymentIntent.objects.create(
            user=profile, role='landlord', amount_kes=1000, status='PAID',
            listing_data={'title': 'Paid Draft'}, expires_at=timezone.now() + timedelta(minutes=15),
        )
        with self.assertRaises(Exception):
            finalize_listing_draft(profile, draft.id, payment_intent_id=intent.id)

    def test_draft_does_not_appear_as_published_listing(self):
        profile = self.make_profile('landlord')
        draft = save_listing_draft(profile, {'title': 'Hidden Draft'})
        self.assertTrue(Listing.objects.filter(pk=draft.id, is_draft=True).exists())
        self.assertFalse(Listing.objects.filter(pk=draft.id, is_draft=False, is_published=True).exists())
