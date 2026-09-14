"""Non-secret business defaults for the SakaKrib entitlement system.

Authoritative subscription plans and prices live in PostgreSQL. These values are
fallback/default rules and must stay aligned with the seeded subscription plans.
"""

FREE_LISTING_LIMIT = 3
INDIVIDUAL_LISTING_PRICE_KES = 1000

LANDLORD_PLANS = {
    'STARTER': {'max_listings': 5, 'max_units_per_listing': 5, 'monthly_price_kes': 500, 'annual_price_kes': 5000},
    'GROWTH': {'max_listings': 20, 'max_units_per_listing': 20, 'monthly_price_kes': 1500, 'annual_price_kes': 15000},
    'PRO': {'max_listings': None, 'max_units_per_listing': None, 'monthly_price_kes': 3500, 'annual_price_kes': 35000},
}

REAL_ESTATE_PLANS = {
    'STARTER': {'max_listings': 5, 'max_units_per_listing': 5, 'monthly_price_kes': 500, 'annual_price_kes': 5000},
    'GROWTH': {'max_listings': 20, 'max_units_per_listing': 20, 'monthly_price_kes': 1500, 'annual_price_kes': 15000},
    'PRO': {'max_listings': None, 'max_units_per_listing': None, 'monthly_price_kes': 3500, 'annual_price_kes': 35000},
    'ENTERPRISE': {'max_listings': None, 'max_units_per_listing': None, 'monthly_price_kes': 20000, 'annual_price_kes': 200000},
}
