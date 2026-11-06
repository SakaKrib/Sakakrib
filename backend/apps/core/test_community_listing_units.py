from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.accounts.models import Profile
from apps.core.community_post_views import CommunityPostV2View
from apps.core.domain_property import CommunityPost, PropertyUnit
from apps.listings.models import Listing


class CommunityListingUnitSerializationTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.owner = Profile.objects.create_user("community-units@example.com", role="real_estate")

    def test_feed_includes_transaction_type_and_unit_pricing_details(self):
        listing = Listing.objects.create(
            user=self.owner,
            title="Saka Residences",
            property_name="Saka Residences",
            city="Nairobi",
            county="Kilimani",
            listing_type="rent",
            is_property_management=True,
            approval_status="approved",
            is_published=True,
            is_draft=False,
        )
        CommunityPost.objects.create(
            user_id=self.owner.id,
            listing_id=listing.id,
            content="Explore Saka Residences.",
            ai_caption="🏢 Multi-unit property",
            post_type="listing",
        )
        PropertyUnit.objects.create(
            listing_id=listing.id,
            user_id=self.owner.id,
            unit_number="A01",
            unit_type="one_bedroom",
            listing_type="rent",
            rent=Decimal("32000.00"),
            deposit_amount=Decimal("32000.00"),
            size="700 sq ft",
            beds=1,
            baths=1,
            availability="available",
        )

        request = self.factory.get("/api/core/community-posts/")
        force_authenticate(request, user=self.owner)
        response = CommunityPostV2View.as_view()(request)

        self.assertEqual(response.status_code, 200)
        post = next(item for item in response.data["items"] if str(item["listing_id"]) == str(listing.id))
        unit = post["listing"]["units"][0]
        self.assertEqual(unit["listing_type"], "rent")
        self.assertEqual(str(unit["rent"]), "32000.00")
        self.assertEqual(str(unit["deposit_amount"]), "32000.00")
        self.assertEqual(unit["size"], "700 sq ft")
        self.assertEqual(unit["beds"], 1)
        self.assertEqual(unit["baths"], 1)
        self.assertEqual(unit["status"], "available")
