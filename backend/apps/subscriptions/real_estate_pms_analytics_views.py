from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Sum
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.domain_property import PropertyUnit, RenterUnitAssociation
from apps.core.domain_rent import RentInvoice
from apps.listings.models import Listing

from .models import RealEstatePMSListingAssignment, SubscriptionListing
from .services import get_real_estate_pms_context


def _month_start(value):
    return value.replace(day=1)


def _money(value):
    return float(value or Decimal('0'))


class RealEstatePMSAnalyticsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        context = get_real_estate_pms_context(request.user)
        if not context:
            return Response({'detail': 'Real-estate PMS access is required.'}, status=403)

        owner_id = context['owner_id']
        subscription = context['subscription']
        managed_listing_ids = list(SubscriptionListing.objects.filter(
            real_estate_subscription_id=subscription.id, status='ACTIVE'
        ).values_list('listing_id', flat=True))
        if context.get('pms_role') == 'AGENT':
            assigned_ids = set(RealEstatePMSListingAssignment.objects.filter(
                real_estate_id=owner_id, agent_id=request.user.id, is_active=True
            ).values_list('listing_id', flat=True))
            managed_listing_ids = [listing_id for listing_id in managed_listing_ids if listing_id in assigned_ids]

        listing_count = Listing.objects.filter(id__in=managed_listing_ids, user_id=owner_id).count()
        units = PropertyUnit.objects.filter(user_id=owner_id, listing_id__in=managed_listing_ids)
        unit_ids = list(units.values_list('id', flat=True))
        associations = RenterUnitAssociation.objects.filter(landlord_id=owner_id, unit_id__in=unit_ids)
        active_associations = associations.filter(status__iexact='ACTIVE')
        invoices = RentInvoice.objects.filter(landlord_id=owner_id, unit_id__in=unit_ids)

        total_units = units.count()
        occupied_units = active_associations.values('unit_id').distinct().count()
        vacant_units = max(0, total_units - occupied_units)
        occupancy_rate = round((occupied_units / total_units) * 100, 1) if total_units else 0

        scheduled_rent = active_associations.aggregate(total=Sum('rent_amount'))['total'] or Decimal('0')
        paid_statuses = {'PAID', 'PARTIALLY_PAID'}
        paid = invoices.filter(status__in=paid_statuses).aggregate(total=Sum('amount_kes'))['total'] or Decimal('0')
        invoiced = invoices.aggregate(total=Sum('amount_kes'))['total'] or Decimal('0')
        outstanding = max(Decimal('0'), invoiced - paid)
        collection_rate = round((_money(paid) / _money(invoiced)) * 100, 1) if invoiced else 0

        today = timezone.localdate()
        expiring_soon = active_associations.filter(
            lease_end__isnull=False,
            lease_end__gte=today,
            lease_end__lte=today + timedelta(days=90),
        ).count()

        current_month = _month_start(today)
        month_rows = []
        for offset in range(5, -1, -1):
            year = current_month.year
            month = current_month.month - offset
            while month <= 0:
                year -= 1
                month += 12
            start = date(year, month, 1)
            end = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
            month_invoices = invoices.filter(billing_period_start__gte=start, billing_period_start__lt=end)
            month_invoiced = month_invoices.aggregate(total=Sum('amount_kes'))['total'] or Decimal('0')
            month_paid = month_invoices.filter(status__in=paid_statuses).aggregate(total=Sum('amount_kes'))['total'] or Decimal('0')
            month_rows.append({
                'month': start.strftime('%Y-%m'),
                'invoiced': _money(month_invoiced),
                'collected': _money(month_paid),
                'outstanding': _money(max(Decimal('0'), month_invoiced - month_paid)),
            })

        return Response({
            'pms_role': context.get('pms_role'),
            'summary': {
                'properties': listing_count,
                'units': total_units,
                'occupied_units': occupied_units,
                'vacant_units': vacant_units,
                'occupancy_rate': occupancy_rate,
                'active_leases': active_associations.count(),
                'leases_expiring_90_days': expiring_soon,
                'scheduled_rent': _money(scheduled_rent),
                'invoiced': _money(invoiced),
                'collected': _money(paid),
                'outstanding': _money(outstanding),
                'collection_rate': collection_rate,
            },
            'trend': month_rows,
        })
