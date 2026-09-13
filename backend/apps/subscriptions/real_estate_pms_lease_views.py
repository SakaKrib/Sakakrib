from calendar import monthrange
from datetime import date
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.domain_property import PropertyUnit, RenterUnitAssociation
from apps.core.domain_rent import RentInvoice, RentInvoicePeriod

from .models import RealEstatePMSListingAssignment
from .services import get_real_estate_pms_context


def _context(user):
    return get_real_estate_pms_context(user)


def _read_only(context):
    return not context or context['subscription'].status == 'GRACE_PERIOD'


def _unit_scope(user, context):
    units = PropertyUnit.objects.filter(user_id=context['owner_id'])
    if context.get('pms_role') == 'AGENT':
        units = units.filter(
            listing_id__in=RealEstatePMSListingAssignment.objects.filter(
                real_estate_id=context['owner_id'], agent_id=user.id, is_active=True
            ).values('listing_id')
        )
    return units


def _can_manage_unit(user, context, unit):
    if unit is None or str(unit.user_id) != str(context['owner_id']):
        return False
    if context.get('pms_role') in ('ADMIN', 'TEAM_MANAGER'):
        return True
    return RealEstatePMSListingAssignment.objects.filter(
        real_estate_id=context['owner_id'], listing_id=unit.listing_id,
        agent_id=user.id, is_active=True,
    ).exists()


def _lease_number(association):
    return f'REL-{str(association.id)[:8].upper()}'


def _lease_status(association):
    status = str(association.status or '').upper()
    if status == 'ACTIVE':
        return 'ACTIVE'
    if status in {'CANCELLED', 'CANCELED'}:
        return 'CANCELLED'
    return 'ENDED'


def _serialize_lease(association, unit):
    return {
        'id': str(association.id),
        'lease_number': _lease_number(association),
        'real_estate_id': str(association.landlord_id),
        'listing_id': str(unit.listing_id),
        'unit_id': str(unit.id),
        'renter_assoc_id': str(association.id),
        'renter_user_id': str(association.renter_user_id) if association.renter_user_id else None,
        'renter_name': association.renter_name,
        'renter_phone': association.renter_phone,
        'renter_email': association.renter_email,
        'lease_start': association.lease_start,
        'lease_end': association.lease_end,
        'monthly_rent_kes': float(association.rent_amount),
        'deposit_amount_kes': float(unit.deposit_amount or 0),
        'rent_due_day': unit.rent_due_day,
        'status': _lease_status(association),
        'renewal_notice_days': 30,
        'notes': None,
        'created_by_id': str(association.landlord_id),
        'created_at': association.created_at,
        'updated_at': association.updated_at,
    }


def _find_association(lease_id, context, user):
    association = RenterUnitAssociation.objects.filter(
        pk=lease_id, landlord_id=context['owner_id']
    ).first()
    if not association:
        return None, None
    unit = PropertyUnit.objects.filter(pk=association.unit_id).first()
    if not _can_manage_unit(user, context, unit):
        return None, None
    return association, unit


def _parse_date(value, field_name):
    try:
        return date.fromisoformat(str(value))
    except (TypeError, ValueError):
        raise ValueError(f'{field_name} is invalid.')


def _next_invoice_number():
    prefix = f'RE-{timezone.localdate().strftime("%Y%m%d")}'
    count = RentInvoice.objects.filter(invoice_number__startswith=prefix).count() + 1
    return f'{prefix}-{count:04d}'


class RealEstatePMSLeaseView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, lease_id=None):
        context = _context(request.user)
        if not context:
            return Response({'detail': 'Real-estate PMS access is required.'}, status=403)
        if lease_id:
            association, unit = _find_association(lease_id, context, request.user)
            if not association:
                return Response({'detail': 'Lease not found.'}, status=404)
            return Response(_serialize_lease(association, unit))

        associations = RenterUnitAssociation.objects.filter(
            landlord_id=context['owner_id'],
            unit_id__in=_unit_scope(request.user, context).values('id'),
        ).order_by('-lease_start', '-created_at')
        units = {str(unit.id): unit for unit in _unit_scope(request.user, context)}
        return Response([
            _serialize_lease(association, units[str(association.unit_id)])
            for association in associations
            if str(association.unit_id) in units
        ])

    @transaction.atomic
    def post(self, request):
        context = _context(request.user)
        if _read_only(context):
            return Response({'detail': 'An active real-estate PMS subscription is required for lease changes.'}, status=403)
        if context.get('pms_role') not in ('ADMIN', 'TEAM_MANAGER', 'AGENT'):
            return Response({'detail': 'You are not authorized to manage leases.'}, status=403)

        unit = PropertyUnit.objects.filter(pk=request.data.get('unit_id')).first()
        if not _can_manage_unit(request.user, context, unit):
            return Response({'detail': 'Unit not found or you are not authorized to manage it.'}, status=404)
        association = RenterUnitAssociation.objects.filter(
            pk=request.data.get('renter_assoc_id'),
            unit_id=unit.id,
            landlord_id=context['owner_id'],
        ).first()
        if not association:
            return Response({'detail': 'The renter association for this unit is required.'}, status=409)

        try:
            lease_start = _parse_date(request.data.get('lease_start'), 'lease_start')
            lease_end = _parse_date(request.data.get('lease_end'), 'lease_end') if request.data.get('lease_end') else None
            monthly_rent = Decimal(str(request.data.get('monthly_rent_kes') or association.rent_amount or unit.rent))
        except (InvalidOperation, TypeError, ValueError):
            return Response({'detail': 'Lease dates or rent are invalid.'}, status=400)
        if lease_end and lease_end < lease_start:
            return Response({'detail': 'Lease end date cannot be before the start date.'}, status=400)
        if monthly_rent <= 0:
            return Response({'detail': 'Rent must be greater than zero.'}, status=400)

        association.lease_start = lease_start
        association.lease_end = lease_end
        association.rent_amount = monthly_rent
        association.status = 'ACTIVE'
        association.save(update_fields=['lease_start', 'lease_end', 'rent_amount', 'status', 'updated_at'])
        return Response(_serialize_lease(association, unit), status=200)

    @transaction.atomic
    def patch(self, request, lease_id=None):
        context = _context(request.user)
        if _read_only(context):
            return Response({'detail': 'An active real-estate PMS subscription is required for lease changes.'}, status=403)
        association, unit = _find_association(lease_id, context, request.user)
        if not association:
            return Response({'detail': 'Lease not found.'}, status=404)

        try:
            if 'lease_start' in request.data:
                association.lease_start = _parse_date(request.data.get('lease_start'), 'lease_start')
            if 'lease_end' in request.data:
                association.lease_end = _parse_date(request.data.get('lease_end'), 'lease_end') if request.data.get('lease_end') else None
            if 'monthly_rent_kes' in request.data:
                association.rent_amount = Decimal(str(request.data.get('monthly_rent_kes')))
        except (InvalidOperation, TypeError, ValueError):
            return Response({'detail': 'Lease terms are invalid.'}, status=400)
        if association.lease_start and association.lease_end and association.lease_end < association.lease_start:
            return Response({'detail': 'Lease end date cannot be before the start date.'}, status=400)
        if association.rent_amount <= 0:
            return Response({'detail': 'Rent must be greater than zero.'}, status=400)

        if 'status' in request.data:
            requested_status = str(request.data.get('status')).upper()
            if requested_status == 'ACTIVE':
                association.status = 'ACTIVE'
            elif requested_status in {'ENDED', 'CANCELLED'}:
                if context.get('pms_role') != 'ADMIN':
                    return Response({'detail': 'Only the real-estate PMS administrator can end or cancel a lease.'}, status=403)
                association.status = requested_status
            elif requested_status != 'PENDING':
                return Response({'detail': 'Invalid lease status.'}, status=400)
        association.save(update_fields=['lease_start', 'lease_end', 'rent_amount', 'status', 'updated_at'])
        return Response(_serialize_lease(association, unit))

    @transaction.atomic
    def delete(self, request, lease_id=None):
        context = _context(request.user)
        if _read_only(context):
            return Response({'detail': 'An active real-estate PMS subscription is required for lease changes.'}, status=403)
        if context.get('pms_role') != 'ADMIN':
            return Response({'detail': 'Only the real-estate PMS administrator can cancel leases.'}, status=403)
        association, _ = _find_association(lease_id, context, request.user)
        if not association:
            return Response({'detail': 'Lease not found.'}, status=404)
        association.status = 'CANCELLED'
        association.save(update_fields=['status', 'updated_at'])
        return Response(status=204)


class RealEstatePMSLeaseInvoiceView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, lease_id):
        context = _context(request.user)
        if _read_only(context):
            return Response({'detail': 'An active real-estate PMS subscription is required for invoice changes.'}, status=403)
        if context.get('pms_role') not in ('ADMIN', 'TEAM_MANAGER'):
            return Response({'detail': 'Only the administrator or team manager can generate rent invoices.'}, status=403)
        association, unit = _find_association(lease_id, context, request.user)
        if not association or not unit or str(association.status).upper() != 'ACTIVE':
            return Response({'detail': 'Active lease not found.'}, status=404)
        if not association.renter_user_id:
            return Response({'detail': 'The renter must have a claimed SakaKrib account before an invoice can be generated.'}, status=409)

        if request.data.get('year') and request.data.get('month'):
            try:
                year, month = int(request.data.get('year')), int(request.data.get('month'))
                period_start = date(year, month, 1)
            except (TypeError, ValueError):
                return Response({'detail': 'Invoice year or month is invalid.'}, status=400)
        else:
            period_start = timezone.localdate().replace(day=1)
            year, month = period_start.year, period_start.month
        period_end = date(year, month, monthrange(year, month)[1])
        if period_end < association.lease_start or (association.lease_end and period_start > association.lease_end):
            return Response({'detail': 'The requested billing period is outside the lease term.'}, status=409)

        existing_period = RentInvoicePeriod.objects.filter(
            renter_assoc_id=association.id, unit_id=unit.id,
            period_year=year, period_month=month,
        ).first()
        if existing_period:
            return Response({'detail': 'An invoice already exists for this lease period.', 'invoice_id': str(existing_period.invoice_id)}, status=409)

        due_day = min(unit.rent_due_day or 1, monthrange(year, month)[1])
        invoice = RentInvoice.objects.create(
            invoice_number=_next_invoice_number(), landlord_id=context['owner_id'],
            renter_user_id=association.renter_user_id, renter_assoc_id=association.id,
            listing_id=unit.listing_id, unit_id=unit.id,
            billing_period_start=period_start, billing_period_end=period_end,
            due_date=date(year, month, due_day), amount_kes=association.rent_amount,
            currency='KES', status='DUE',
        )
        RentInvoicePeriod.objects.create(
            invoice_id=invoice.id, renter_assoc_id=association.id, unit_id=unit.id,
            period_year=year, period_month=month, amount_kes=association.rent_amount,
        )
        return Response({
            'id': str(invoice.id), 'invoice_number': invoice.invoice_number,
            'lease_id': str(association.id), 'billing_period_start': period_start,
            'billing_period_end': period_end, 'due_date': date(year, month, due_day),
            'amount_kes': float(invoice.amount_kes), 'status': invoice.status,
        }, status=201)
