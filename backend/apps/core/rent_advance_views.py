from datetime import date
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.authorization import can_manage_listings
from apps.listings.models import Listing
from .domain_property import PropertyUnit, RenterUnitAssociation
from .domain_rent import RentPayment


def _unit_payload(unit, association, listing):
    return {
        'unit_id': str(unit.id), 'listing_id': str(unit.listing_id),
        'listing_title': listing.title if listing else '', 'unit_number': unit.unit_number,
        'unit_type': unit.unit_type, 'rent': float(Decimal(unit.rent)), 'beds': unit.beds,
        'baths': unit.baths, 'availability': unit.availability,
        'renter_name': association.renter_name if association else None,
        'renter_assoc_id': str(association.id) if association else None,
        'renter_phone': association.renter_phone if association else None,
        'renter_email': association.renter_email if association else None,
        'lease_start': association.lease_start if association else None,
        'lease_end': association.lease_end if association else None,
        'assoc_status': association.status if association else None,
        'rent_paid_in_advance': bool(unit.rent_paid_in_advance),
        'rent_paid_through_month': unit.rent_paid_through_month.isoformat() if unit.rent_paid_through_month else None,
        'rent_due_day': unit.rent_due_day, 'payment_tracking_enabled': bool(unit.payment_tracking_enabled),
    }


class LandlordRentUnitView(APIView):
    def get(self, request):
        if not can_manage_listings(request.user):
            return Response({'detail': 'Landlord access is required.'}, status=403)
        listing_id = request.query_params.get('listing_id')
        units = PropertyUnit.objects.filter(user_id=request.user.id)
        if listing_id:
            units = units.filter(listing_id=listing_id)
        listing_ids = list(units.values_list('listing_id', flat=True))
        listings = {str(x.id): x for x in Listing.objects.filter(id__in=listing_ids)}
        unit_ids = list(units.values_list('id', flat=True))
        associations = {}
        for row in RenterUnitAssociation.objects.filter(unit_id__in=unit_ids, status__iexact='ACTIVE').order_by('-created_at'):
            associations.setdefault(str(row.unit_id), row)
        return Response([_unit_payload(unit, associations.get(str(unit.id)), listings.get(str(unit.listing_id))) for unit in units.order_by('position', 'created_at')])


class LandlordRentPaymentHistoryView(APIView):
    def get(self, request, unit_id):
        if not can_manage_listings(request.user):
            return Response({'detail': 'Landlord access is required.'}, status=403)
        if not PropertyUnit.objects.filter(id=unit_id, user_id=request.user.id).exists():
            return Response({'detail': 'Unit not found or not owned by this account.'}, status=404)
        rows = RentPayment.objects.filter(landlord_id=request.user.id, unit_id=unit_id).order_by('-period_year', '-period_month')
        return Response([{
            'id': str(x.id), 'renter_assoc_id': str(x.renter_assoc_id), 'unit_id': str(x.unit_id),
            'amount_kes': float(x.amount_kes), 'period_year': x.period_year, 'period_month': x.period_month,
            'status': x.status, 'paid_at': x.paid_at, 'payment_provider': x.payment_provider,
            'payment_method': x.payment_method, 'note': x.result_description,
        } for x in rows])


class LandlordMarkRentPaidThroughView(APIView):
    @transaction.atomic
    def get(self, request, unit_id):
        if not can_manage_listings(request.user):
            return Response({'detail': 'Landlord access is required.'}, status=403)
        unit = PropertyUnit.objects.filter(id=unit_id, user_id=request.user.id).first()
        if unit is None:
            return Response({'detail': 'Unit not found or not owned by this account.'}, status=404)
        rows = RentPayment.objects.filter(
            landlord_id=request.user.id,
            unit_id=unit.id,
            payment_method='RENT_IN_ADVANCE',
            status__iexact='PAID',
        ).order_by('-period_year', '-period_month')
        return Response({
            'unit_id': str(unit.id),
            'paid_in_advance': bool(unit.rent_paid_in_advance),
            'paid_through_month': unit.rent_paid_through_month.isoformat() if unit.rent_paid_through_month else None,
            'advance_records': [{
                'id': str(x.id),
                'period_year': x.period_year,
                'period_month': x.period_month,
                'amount_kes': float(x.amount_kes),
                'paid_at': x.paid_at,
                'note': x.result_description,
            } for x in rows],
        })

    @transaction.atomic
    def post(self, request, unit_id):
        if not can_manage_listings(request.user):
            return Response({'detail': 'Landlord access is required.'}, status=403)
        try:
            through = date.fromisoformat(str(request.data.get('paid_through_month')))
        except (TypeError, ValueError):
            return Response({'detail': 'paid_through_month must be YYYY-MM-DD.'}, status=400)
        if through.day != 1:
            return Response({'detail': 'paid_through_month must be the first day of a month.'}, status=400)
        reason = str(request.data.get('reason') or '').strip()
        if len(reason) < 5:
            return Response({'detail': 'A short reason is required for a manual paid-through adjustment.'}, status=400)

        unit = PropertyUnit.objects.select_for_update().filter(id=unit_id, user_id=request.user.id).first()
        if unit is None:
            return Response({'detail': 'Unit not found or not owned by this account.'}, status=404)
        current = timezone.localdate().replace(day=1)
        if through < current:
            return Response({'detail': 'Paid-through month cannot be earlier than the current month.'}, status=400)
        months_covered = (through.year - current.year) * 12 + through.month - current.month + 1
        if months_covered > 12:
            return Response({'detail': 'At most 12 consecutive months can be marked paid at once.'}, status=400)
        association = RenterUnitAssociation.objects.filter(
            unit_id=unit.id, landlord_id=request.user.id, status__iexact='ACTIVE'
        ).order_by('-created_at').first()
        if association is None:
            return Response({'detail': 'No active renter is associated with this unit.'}, status=400)

        marked = already = 0
        for offset in range(months_covered):
            month_index = current.month - 1 + offset
            year = current.year + month_index // 12
            month = month_index % 12 + 1
            existing = RentPayment.objects.filter(
                renter_assoc_id=association.id, period_year=year, period_month=month
            ).first()
            if existing:
                if str(existing.status).upper() != 'PAID':
                    transaction.set_rollback(True)
                    return Response({'detail': f'Billing period {year}-{month:02d} has an existing non-paid payment record.'}, status=400)
                already += 1
                continue
            RentPayment.objects.create(
                renter_assoc_id=association.id, unit_id=unit.id, landlord_id=request.user.id,
                amount_kes=Decimal(unit.rent), period_year=year, period_month=month, status='PAID',
                paid_at=timezone.now(), payment_provider='MANUAL', payment_method='RENT_IN_ADVANCE',
                result_description=reason,
            )
            marked += 1

        unit.rent_paid_in_advance = True
        unit.rent_paid_through_month = through
        unit.save(update_fields=['rent_paid_in_advance', 'rent_paid_through_month', 'updated_at'])
        return Response({
            'unit_id': str(unit.id), 'paid_through_month': through.isoformat(),
            'months_marked_paid': marked, 'months_already_paid': already,
            'months_covered': months_covered, 'payment_provider': 'MANUAL',
            'payment_method': 'RENT_IN_ADVANCE', 'reason': reason,
        })
