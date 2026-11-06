"""Rent / sale pricing for property units (shared by every unit create and edit path)."""
from decimal import Decimal, InvalidOperation

FREQUENCIES = {'monthly', 'quarterly', 'yearly'}
PRICING_FIELDS = ('listing_type', 'sale_price', 'installment_total_price', 'installment_deposit',
                  'installment_amount', 'installment_frequency', 'installment_periods')


def _first(data, *keys):
    for key in keys:
        if isinstance(data, dict) or hasattr(data, 'get'):
            value = data.get(key)
            if value is not None and value != '':
                return value
    return None


def _money(value, label):
    if value is None:
        return None
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        raise ValueError(f'{label} must be a valid number.')
    if amount < 0:
        raise ValueError(f'{label} cannot be negative.')
    return amount


def normalize_unit_pricing(data, current=None):
    """Return the model fields for a unit's pricing, or raise ValueError with a user-facing message.

    `data` may use snake_case (API) or camelCase (listing form drafts). `current` is an existing
    unit whose values fill any field the request does not mention (used by PATCH).
    """
    def pick(snake, camel, attr, default=None):
        for key in (snake, camel):
            if hasattr(data, 'get') and key in data:
                value = data[key]
                return None if value == '' else value
        return getattr(current, attr, default) if current is not None else default

    listing_type = 'sale' if str(pick('listing_type', 'listingType', 'listing_type', 'rent')).lower() == 'sale' else 'rent'
    rent = _money(pick('rent', 'rent', 'rent', 0), 'Rent') or Decimal('0')

    if listing_type == 'rent':
        if rent <= 0:
            raise ValueError('Monthly rent must be greater than zero.')
        return {'listing_type': 'rent', 'rent': rent, 'sale_price': None, 'installment_total_price': None,
                'installment_deposit': None, 'installment_amount': None, 'installment_frequency': None, 'installment_periods': None}

    sale_price = _money(pick('sale_price', 'salePrice', 'sale_price'), 'Sale price')
    deposit = _money(pick('installment_deposit', 'installmentDeposit', 'installment_deposit'), 'Installment deposit')
    amount = _money(pick('installment_amount', 'installmentAmount', 'installment_amount'), 'Installment amount')
    raw_periods = pick('installment_periods', 'installmentPeriods', 'installment_periods')
    frequency = str(pick('installment_frequency', 'installmentFrequency', 'installment_frequency') or '').lower() or None
    total = _money(pick('installment_total_price', 'installmentTotalPrice', 'installment_total_price'), 'Installment total price')
    try:
        periods = int(raw_periods) if raw_periods not in (None, '') else None
    except (TypeError, ValueError):
        raise ValueError('Number of installments must be a whole number.')

    has_installment = bool(amount and amount > 0)
    if has_installment:
        if frequency not in FREQUENCIES:
            raise ValueError('Choose how often installments are paid: monthly, quarterly or yearly.')
        if not periods or periods < 1 or periods > 600:
            raise ValueError('Enter the number of installments (1 or more).')
        if total is None or total <= 0:
            total = (deposit or Decimal('0')) + amount * periods
    else:
        deposit = amount = total = None
        frequency = periods = None

    if not (sale_price and sale_price > 0) and not has_installment:
        raise ValueError('Enter the sale price (buy at once), an installment plan, or both.')
    return {'listing_type': 'sale', 'rent': Decimal('0'), 'sale_price': sale_price if sale_price and sale_price > 0 else None,
            'installment_total_price': total, 'installment_deposit': deposit, 'installment_amount': amount,
            'installment_frequency': frequency, 'installment_periods': periods}


def pricing_payload(unit):
    def num(value):
        return float(value) if value is not None else None
    return {
        'listing_type': getattr(unit, 'listing_type', 'rent') or 'rent',
        'sale_price': num(getattr(unit, 'sale_price', None)),
        'installment_total_price': num(getattr(unit, 'installment_total_price', None)),
        'installment_deposit': num(getattr(unit, 'installment_deposit', None)),
        'installment_amount': num(getattr(unit, 'installment_amount', None)),
        'installment_frequency': getattr(unit, 'installment_frequency', None),
        'installment_periods': getattr(unit, 'installment_periods', None),
    }


def sync_listing_price(listing_id):
    """Keep the parent property's headline price and type in step with its units ("From KES x")."""
    from apps.listings.models import Listing
    from .domain_property import PropertyUnit

    units = list(PropertyUnit.objects.filter(listing_id=listing_id))
    if not units:
        return
    rent_units = [u for u in units if (u.listing_type or 'rent') == 'rent' and u.rent and u.rent > 0]
    sale_prices = [p for u in units if u.listing_type == 'sale' for p in (u.sale_price, u.installment_total_price) if p]
    if rent_units:
        listing_type, price = 'rent', min(u.rent for u in rent_units)
    elif sale_prices:
        listing_type, price = 'sale', min(sale_prices)
    else:
        return
    Listing.objects.filter(pk=listing_id).update(listing_type=listing_type, price_kes=price)
