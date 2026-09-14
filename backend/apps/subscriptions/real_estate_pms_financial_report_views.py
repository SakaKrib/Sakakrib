from collections import defaultdict
from datetime import date
from decimal import Decimal

from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.domain_property import PropertyUnit, RenterUnitAssociation
from apps.core.domain_rent import RentInvoice, RentPaymentSubmission
from apps.listings.models import Listing

from .models import RealEstatePMSListingAssignment
from .services import get_real_estate_pms_context


def _context(user):
    return get_real_estate_pms_context(user)


def _portfolio_units(user, context):
    units = PropertyUnit.objects.filter(user_id=context['owner_id'])
    if context.get('pms_role') == 'AGENT':
        units = units.filter(
            listing_id__in=RealEstatePMSListingAssignment.objects.filter(
                real_estate_id=context['owner_id'], agent_id=user.id, is_active=True
            ).values('listing_id')
        )
    return units


def _money(value):
    return float(value or Decimal('0'))


class RealEstatePMSFinancialReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        context = _context(request.user)
        if not context:
            return Response({'detail': 'Real-estate PMS access is required.'}, status=403)

        units = _portfolio_units(request.user, context)
        unit_ids = list(units.values_list('id', flat=True))
        listing_ids = list(units.values_list('listing_id', flat=True).distinct())

        today = timezone.localdate()
        try:
            months = max(1, min(24, int(request.query_params.get('months', '12'))))
        except (TypeError, ValueError):
            months = 12

        month_start = date(today.year, today.month, 1)
        first_month = month_start
        for _ in range(months - 1):
            first_month = date(
                first_month.year - (1 if first_month.month == 1 else 0),
                12 if first_month.month == 1 else first_month.month - 1,
                1,
            )

        invoices = list(
            RentInvoice.objects.filter(
                landlord_id=context['owner_id'],
                unit_id__in=unit_ids,
            ).order_by('billing_period_start', 'created_at')
        )
        report_invoices = [
            invoice for invoice in invoices
            if invoice.billing_period_start >= first_month
            and invoice.billing_period_start <= today
        ]

        paid_statuses = {'PAID'}
        outstanding_statuses = {'DUE', 'OVERDUE', 'PARTIALLY_PAID'}
        invoiced = sum((invoice.amount_kes for invoice in report_invoices), Decimal('0'))
        collected = sum(
            (invoice.amount_kes for invoice in report_invoices if str(invoice.status).upper() in paid_statuses),
            Decimal('0'),
        )
        outstanding = sum(
            (invoice.amount_kes for invoice in report_invoices if str(invoice.status).upper() in outstanding_statuses),
            Decimal('0'),
        )
        collection_rate = float((collected / invoiced * 100) if invoiced else Decimal('0'))

        listing_map = {
            str(row.id): row.title
            for row in Listing.objects.filter(id__in=listing_ids)
        }
        unit_map = {str(row.id): row for row in units}
        associations = {
            str(row.unit_id): row
            for row in RenterUnitAssociation.objects.filter(
                landlord_id=context['owner_id'],
                unit_id__in=unit_ids,
                status__iexact='ACTIVE',
            ).order_by('-created_at')
        }

        property_totals = defaultdict(lambda: {
            'listing_id': '', 'property_name': 'Unknown property', 'units': 0,
            'occupied_units': 0, 'invoiced_kes': Decimal('0'),
            'collected_kes': Decimal('0'), 'outstanding_kes': Decimal('0'),
        })
        unit_totals = defaultdict(lambda: {
            'unit_id': '', 'unit_number': '', 'listing_id': '',
            'property_name': 'Unknown property', 'invoiced_kes': Decimal('0'),
            'collected_kes': Decimal('0'), 'outstanding_kes': Decimal('0'),
        })

        for unit in unit_map.values():
            listing_key = str(unit.listing_id)
            property_totals[listing_key]['listing_id'] = listing_key
            property_totals[listing_key]['property_name'] = listing_map.get(listing_key, 'Unknown property')
            property_totals[listing_key]['units'] += 1
            if str(unit.id) in associations:
                property_totals[listing_key]['occupied_units'] += 1

            unit_key = str(unit.id)
            unit_totals[unit_key]['unit_id'] = unit_key
            unit_totals[unit_key]['unit_number'] = unit.unit_number
            unit_totals[unit_key]['listing_id'] = listing_key
            unit_totals[unit_key]['property_name'] = listing_map.get(listing_key, 'Unknown property')

        monthly = {}
        cursor = first_month
        for _ in range(months):
            key = cursor.strftime('%Y-%m')
            monthly[key] = {
                'month': key,
                'invoiced_kes': Decimal('0'),
                'collected_kes': Decimal('0'),
                'outstanding_kes': Decimal('0'),
            }
            cursor = date(
                cursor.year + (1 if cursor.month == 12 else 0),
                1 if cursor.month == 12 else cursor.month + 1,
                1,
            )

        for invoice in report_invoices:
            status = str(invoice.status).upper()
            month_key = invoice.billing_period_start.strftime('%Y-%m')
            bucket = monthly.get(month_key)
            if not bucket:
                continue
            bucket['invoiced_kes'] += invoice.amount_kes
            if status in paid_statuses:
                bucket['collected_kes'] += invoice.amount_kes
            elif status in outstanding_statuses:
                bucket['outstanding_kes'] += invoice.amount_kes

            listing_key = str(invoice.listing_id)
            property_bucket = property_totals[listing_key]
            property_bucket['listing_id'] = listing_key
            property_bucket['property_name'] = listing_map.get(listing_key, 'Unknown property')
            property_bucket['invoiced_kes'] += invoice.amount_kes
            if status in paid_statuses:
                property_bucket['collected_kes'] += invoice.amount_kes
            elif status in outstanding_statuses:
                property_bucket['outstanding_kes'] += invoice.amount_kes

            unit_bucket = unit_totals[str(invoice.unit_id)]
            unit_bucket['invoiced_kes'] += invoice.amount_kes
            if status in paid_statuses:
                unit_bucket['collected_kes'] += invoice.amount_kes
            elif status in outstanding_statuses:
                unit_bucket['outstanding_kes'] += invoice.amount_kes

        submission_invoice_ids = list(
            RentPaymentSubmission.objects.filter(
                landlord_id=context['owner_id'],
                unit_id__in=unit_ids,
                status__iexact='PENDING',
                invoice_id__in=[invoice.id for invoice in report_invoices],
            ).values_list('invoice_id', flat=True)
        )

        def property_row(item):
            rate = (item['collected_kes'] / item['invoiced_kes'] * 100) if item['invoiced_kes'] else Decimal('0')
            return {
                'listing_id': item['listing_id'],
                'property_name': item['property_name'],
                'units': item['units'],
                'occupied_units': item['occupied_units'],
                'vacant_units': max(0, item['units'] - item['occupied_units']),
                'invoiced_kes': _money(item['invoiced_kes']),
                'collected_kes': _money(item['collected_kes']),
                'outstanding_kes': _money(item['outstanding_kes']),
                'collection_rate': round(float(rate), 2),
            }

        def unit_row(item):
            rate = (item['collected_kes'] / item['invoiced_kes'] * 100) if item['invoiced_kes'] else Decimal('0')
            return {
                'unit_id': item['unit_id'],
                'unit_number': item['unit_number'],
                'listing_id': item['listing_id'],
                'property_name': item['property_name'],
                'invoiced_kes': _money(item['invoiced_kes']),
                'collected_kes': _money(item['collected_kes']),
                'outstanding_kes': _money(item['outstanding_kes']),
                'collection_rate': round(float(rate), 2),
            }

        return Response({
            'period': {
                'months': months,
                'from': first_month,
                'to': today,
            },
            'summary': {
                'invoiced_kes': _money(invoiced),
                'collected_kes': _money(collected),
                'outstanding_kes': _money(outstanding),
                'collection_rate': round(collection_rate, 2),
                'invoice_count': len(report_invoices),
                'pending_payment_submissions': len(submission_invoice_ids),
            },
            'monthly': [
                {
                    'month': item['month'],
                    'invoiced_kes': _money(item['invoiced_kes']),
                    'collected_kes': _money(item['collected_kes']),
                    'outstanding_kes': _money(item['outstanding_kes']),
                }
                for item in monthly.values()
            ],
            'properties': [property_row(item) for item in property_totals.values()],
            'units': [unit_row(item) for item in unit_totals.values() if item['invoiced_kes'] or item['collected_kes'] or item['outstanding_kes']],
            'pms_role': context.get('pms_role'),
        })
