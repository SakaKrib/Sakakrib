from decimal import Decimal

from django.test import TestCase

from apps.accounts.models import Profile
from apps.core.domain_property import PropertyUnit

from .ai_caption_services import _fallback_caption, _unit_rows
from .models import Listing


class ListingCaptionGenerationTests(TestCase):
    def setUp(self):
        self.owner = Profile.objects.create_user("captions@example.com", role="real_estate")

    def test_single_rental_caption_uses_monthly_rent_and_rental_facts(self):
        listing = Listing.objects.create(
            user=self.owner,
            title="Two-bedroom apartment",
            property_name="Green Court",
            city="Nairobi",
            county="Westlands",
            listing_type="rent",
            price_kes=Decimal("35000.00"),
            size="850 sq ft",
            beds=2,
            baths=1,
            deposit_required=True,
            deposit_amount=Decimal("35000.00"),
            description="A bright apartment with a practical layout.",
        )

        caption = _fallback_caption(listing, [])

        self.assertIn("FOR RENT", caption)
        self.assertIn("Green Court", caption)
        self.assertIn("Monthly rent: KES 35,000", caption)
        self.assertIn("850 sq ft", caption)
        self.assertIn("Deposit: KES 35,000", caption)
        self.assertNotIn("FOR SALE", caption)
        self.assertNotIn("KES 0", caption)

    def test_single_sale_caption_uses_asking_price_not_monthly_rent(self):
        listing = Listing.objects.create(
            user=self.owner,
            title="Family home",
            city="Kiambu",
            county="Kiambu",
            listing_type="sale",
            price_kes=Decimal("12500000.00"),
            size="Quarter acre",
            beds=4,
            baths=3,
            description="A family home.",
        )

        caption = _fallback_caption(listing, [])

        self.assertIn("FOR SALE", caption)
        self.assertIn("Asking price: KES 12,500,000", caption)
        self.assertNotIn("/month", caption)
        self.assertNotIn("Deposit:", caption)

    def test_multi_unit_caption_uses_dedicated_rent_and_sale_unit_details(self):
        listing = Listing.objects.create(
            user=self.owner,
            title="Mixed-use property",
            property_name="Saka Residences",
            city="Nairobi",
            county="Kilimani",
            listing_type="rent",
            is_property_management=True,
            description="A managed property with individual units.",
        )
        PropertyUnit.objects.create(
            listing_id=listing.id,
            user_id=self.owner.id,
            unit_number="A01",
            unit_type="one_bedroom",
            listing_type="rent",
            rent=Decimal("30000.00"),
            deposit_amount=Decimal("30000.00"),
            size="650 sq ft",
            beds=1,
            baths=1,
            description="A compact one-bedroom unit.",
        )
        PropertyUnit.objects.create(
            listing_id=listing.id,
            user_id=self.owner.id,
            unit_number="B02",
            unit_type="two_bedroom",
            listing_type="sale",
            rent=Decimal("0.00"),
            sale_price=Decimal("9500000.00"),
            installment_total_price=Decimal("10000000.00"),
            installment_deposit=Decimal("2000000.00"),
            installment_amount=Decimal("250000.00"),
            installment_frequency="monthly",
            installment_periods=32,
            size="950 sq ft",
            beds=2,
            baths=2,
            description="A spacious two-bedroom unit.",
        )

        rows = _unit_rows(listing)
        caption = _fallback_caption(listing, rows)

        self.assertIn("MULTI-UNIT PROPERTY — RENT & SALE OPTIONS", caption)
        self.assertIn("FOR RENT — Unit A01", caption)
        self.assertIn("KES 30,000/month", caption)
        self.assertIn("FOR SALE — Unit B02", caption)
        self.assertIn("Asking price KES 9,500,000", caption)
        self.assertIn("installments KES 250,000/month for 32 payments", caption)
        self.assertIn("650 sq ft", caption)
        self.assertIn("950 sq ft", caption)
