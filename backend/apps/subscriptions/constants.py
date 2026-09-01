"""Non-secret business defaults for the SakaKrib entitlement system.

Authoritative subscription plans and prices live in PostgreSQL. These values are
only the fallback/default rules that must remain consistent with the existing
Supabase implementation.
"""

FREE_LISTING_LIMIT = 3
INDIVIDUAL_LISTING_PRICE_KES = 1000

LANDLORD_PLANS = {
    'STARTER': {'max_listings': 5, 'max_units_per_listing': 5, 'monthly_price_kes': 500, 'annual_price_kes': 5000},
    'GROWTH': {'max_listings': 20, 'max_units_per_listing': 20, 'monthly_price_kes': 1500, 'annual_price_kes': 15000},
    'PRO': {'max_listings': None, 'max_units_per_listing': None, 'monthly_price_kes': 3500, 'annual_price_kes': 35000},
}

REAL_ESTATE_PLANS = {
    'STARTER': {'max_listings': 10, 'max_units_per_listing': 10, 'monthly_price_kes': 2000, 'annual_price_kes': 20000},
    'GROWTH': {'max_listings': 30, 'max_units_per_listing': 30, 'monthly_price_kes': 5000, 'annual_price_kes': 50000},
    'PRO': {'max_listings': 50, 'max_units_per_listing': 50, 'monthly_price_kes': 10000, 'annual_price_kes': 100000},
    'ENTERPRISE': {'max_listings': None, 'max_units_per_listing': None, 'monthly_price_kes': 20000, 'annual_price_kes': 200000},
}
