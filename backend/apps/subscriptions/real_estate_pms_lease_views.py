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

from .models import RealEstatePMSLease, RealEstatePMSListingAssignment
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


def _serialize_lease(lease):
    association = RenterUnitAssociation.objects.filter(pk=lease.renter_assoc_id).first()
    return {
        'id': str(lease.id), 'lease_number': lease.lease_number,
        'real_estate_id': str(lease.real_estate_id), 'listing_id': str(lease.listing_id),
        'unit_id': str(lease.unit_id), 'renter_assoc_id': str(lease.renter_assoc_id),
        'renter_user_id': str(lease.renter_user_id) if lease.renter_user_id else None,
        'renter_name': association.renter_name if association else None,
        'renter_phone': association.renter_phone if association else None,
        'renter_email': association.renter_email if association else None,
        'lease_start': lease.lease_start, 'lease_end': lease.lease_end,
        'monthly_rent_kes': float(lease.monthly_rent_kes),
        'deposit_amount_kes': float(lease.deposit_amount_kes), 'rent_due_day': lease.rent_due_day,
        'status': lease.status, 'renewal_notice_days': lease.renewal_notice_days,
        'notes': lease.notes, 'created_by_id': str(lease.created_by_id),
        'created_at': lease.created_at, 'updated_at': lease.updated_at,
    }


def _parse_date(value, field_name):
    try:
        return date.fromisoformat(str(value))
    except (TypeError, ValueError):
        raise ValueError(f'{field_name} is invalid.')


def _next_invoice_number():
    prefix = f'RE-{timezone.localdate().strftime("%Y%m%d")}'
    count = RentInvoice.objects.filter(invoice_number__startswith=prefix).count() + 1
    return f'{prefix}-{count:04d}'


def _next_lease_number(unit_id):
    prefix = f'REL-{timezone.localdate().strftime("%Y%m%d")}-{str(unit_id)[:8].upper()}'
    count = RealEstatePMSLease.objects.filter(lease_number__startswith=prefix).count() + 1
    return f'{prefix}-{count:02d}'


class RealEstatePMSLeaseView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, lease_id=None):
        context = _context(request.user)
        if not context:
            return Response({'detail': 'Real-estate PMS access is required.'}, status=403)
        if lease_id:
            lease = RealEstatePMSLease.objects.filter(pk=lease_id, real_estate_id=context['owner_id']).first()
            if not lease:
                return Response({'detail': 'Lease not found.'}, status=404)
            unit = PropertyUnit.objects.filter(pk=lease.unit_id).first()
            if not _can_manage_unit(request.user, context, unit):
                return Response({'detail': 'You are not authorized to view this lease.'}, status=403)
            return Response(_serialize_lease(lease))

        leases = RealEstatePMSLease.objects.filter(
            real_estate_id=context['owner_id'], unit_id__in=_unit_scope(request.user, context).values('id')
        ).order_by('-lease_start', '-created_at')
        return Response([_serialize_lease(lease) for lease in leases])

    @transaction.atomic
    def post(self, request):
        context = _context(request.user)
        if _read_only(context):
            return Response({'detail': 'An active real-estate PMS subscription is required for lease changes.'}, status=403)
        if context.get('pms_role') not in ('ADMIN', 'TEAM_MANAGER', 'AGENT'):
            return Response({'detail': 'You are not authorized to create leases.'}, status=403)

        unit = PropertyUnit.objects.filter(pk=request.data.get('unit_id')).first()
        if not _can_manage_unit(request.user, context, unit):
            return Response({'detail': 'Unit not found or you are not authorized to manage it.'}, status=404)
        association = RenterUnitAssociation.objects.filter(
            pk=request.data.get('renter_assoc_id'), unit_id=unit.id,
            landlord_id=context['owner_id'], status__iexact='ACTIVE',
        ).first()
        if not association:
            return Response({'detail': 'An active renter association for this unit is required.'}, status=409)

        try:
            lease_start = _parse_date(request.data.get('lease_start'), 'lease_start')
            lease_end = _parse_date(request.data.get('lease_end'), 'lease_end') if request.data.get('lease_end') else None
            monthly_rent = Decimal(str(request.data.get('monthly_rent_kes') or association.rent_amount or unit.rent))
            deposit = Decimal(str(request.data.get('deposit_amount_kes') or unit.deposit_amount or 0))
            due_day = int(request.data.get('rent_due_day') or unit.rent_due_day or 1)
            notice_days = int(request.data.get('renewal_notice_days') or 30)
        except (InvalidOperation, TypeError, ValueError):
            return Response({'detail': 'Lease dates or financial terms are invalid.'}, status=400)
        if lease_end and lease_end < lease_start:
            return Response({'detail': 'Lease end date cannot be before the start date.'}, status=400)
        if monthly_rent <= 0 or deposit < 0:
            return Response({'detail': 'Rent must be greater than zero and deposit cannot be negative.'}, status=400)
        if not 1 <= due_day <= 31:
            return Response({'detail': 'Rent due day must be between 1 and 31.'}, status=400)
        if notice_days < 0:
            return Response({'detail': 'Renewal notice days cannot be negative.'}, status=400)
        if RealEstatePMSLease.objects.filter(unit_id=unit.id, status='ACTIVE').exists():
            return Response({'detail': 'This unit already has an active lease.'}, status=409)

        lease = RealEstatePMSLease.objects.create(
            real_estate_id=context['owner_id'], listing_id=unit.listing_id, unit_id=unit.id,
            renter_assoc_id=association.id, renter_user_id=association.renter_user_id,
            created_by_id=request.user.id, lease_number=_next_lease_number(unit.id),
            lease_start=lease_start, lease_end=lease_end, monthly_rent_kes=monthly_rent,
            deposit_amount_kes=deposit, rent_due_day=due_day, status=RealEstatePMSLease.STATUS_ACTIVE,
            renewal_notice_days=notice_days, notes=request.data.get('notes') or None,
        )
        association.lease_start = lease_start
        association.lease_end = lease_end
        association.rent_amount = monthly_rent
        association.save(update_fields=['lease_start', 'lease_end', 'rent_amount', 'updated_at'])
        return Response(_serialize_lease(lease), status=201)

    @transaction.atomic
    def patch(self, request, lease_id=None):
        context = _context(request.user)
        if _read_only(context):
            return Response({'detail': 'An active real-estate PMS subscription is required for lease changes.'}, status=403)
        lease = RealEstatePMSLease.objects.filter(pk=lease_id, real_estate_id=context['owner_id']).first()
        if not lease:
            return Response({'detail': 'Lease not found.'}, status=404)
        unit = PropertyUnit.objects.filter(pk=lease.unit_id).first()
        if not _can_manage_unit(request.user, context, unit):
            return Response({'detail': 'You are not authorized to edit this lease.'}, status=403)
        if lease.status == RealEstatePMSLease.STATUS_ENDED:
            return Response({'detail': 'Ended leases are read-only.'}, status=409)

        try:
            if 'lease_start' in request.data: lease.lease_start = _parse_date(request.data.get('lease_start'), 'lease_start')
            if 'lease_end' in request.data: lease.lease_end = _parse_date(request.data.get('lease_end'), 'lease_end') if request.data.get('lease_end') else None
            if 'monthly_rent_kes' in request.data: lease.monthly_rent_kes = Decimal(str(request.data.get('monthly_rent_kes')))
            if 'deposit_amount_kes' in request.data: lease.deposit_amount_kes = Decimal(str(request.data.get('deposit_amount_kes')))
            if 'rent_due_day' in request.data: lease.rent_due_day = int(request.data.get('rent_due_day'))
            if 'renewal_notice_days' in request.data: lease.renewal_notice_days = int(request.data.get('renewal_notice_days'))
        except (InvalidOperation, TypeError, ValueError):
            return Response({'detail': 'Lease terms are invalid.'}, status=400)
        if lease.lease_end and lease.lease_end < lease.lease_start:
            return Response({'detail': 'Lease end date cannot be before the start date.'}, status=400)
        if lease.monthly_rent_kes <= 0 or lease.deposit_amount_kes < 0:
            return Response({'detail': 'Invalid rent or deposit.'}, status=400)
        if not 1 <= lease.rent_due_day <= 31 or lease.renewal_notice_days < 0:
            return Response({'detail': 'Invalid rent due day or renewal notice period.'}, status=400)
        if 'status' in request.data:
            requested_status = str(request.data.get('status')).upper()
            if requested_status not in {RealEstatePMSLease.STATUS_PENDING, RealEstatePMSLease.STATUS_ACTIVE, RealEstatePMSLease.STATUS_ENDED, RealEstatePMSLease.STATUS_CANCELLED}:
                return Response({'detail': 'Invalid lease status.'}, status=400)
            if requested_status == RealEstatePMSLease.STATUS_ACTIVE and RealEstatePMSLease.objects.filter(unit_id=lease.unit_id, status='ACTIVE').exclude(pk=lease.id).exists():
                return Response({'detail': 'This unit already has another active lease.'}, status=409)
            lease.status = requested_status
        if 'notes' in request.data: lease.notes = request.data.get('notes') or None
        lease.save()

        association = RenterUnitAssociation.objects.filter(pk=lease.renter_assoc_id).first()
        if association:
            association.lease_start = lease.lease_start
            association.lease_end = lease.lease_end
            association.rent_amount = lease.monthly_rent_kes
            association.save(update_fields=['lease_start', 'lease_end', 'rent_amount', 'updated_at'])
        return Response(_serialize_lease(lease))

    @transaction.atomic
    def delete(self, request, lease_id=None):
        context = _context(request.user)
        if _read_only(context):
            return Response({'detail': 'An active real-estate PMS subscription is required for lease changes.'}, status=403)
        if context.get('pms_role') != 'ADMIN':
            return Response({'detail': 'Only the real-estate PMS administrator can delete leases.'}, status=403)
        lease = RealEstatePMSLease.objects.filter(pk=lease_id, real_estate_id=context['owner_id']).first()
        if not lease:
            return Response({'detail': 'Lease not found.'}, status=404)
        lease.status = RealEstatePMSLease.STATUS_CANCELLED
        lease.save(update_fields=['status', 'updated_at'])
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
        lease = RealEstatePMSLease.objects.filter(pk=lease_id, real_estate_id=context['owner_id'], status='ACTIVE').first()
        if not lease:
            return Response({'detail': 'Active lease not found.'}, status=404)
        if not lease.renter_user_id:
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
        if period_end < lease.lease_start or (lease.lease_end and period_start > lease.lease_end):
            return Response({'detail': 'The requested billing period is outside the lease term.'}, status=409)
        existing_period = RentInvoicePeriod.objects.filter(renter_assoc_id=lease.renter_assoc_id, unit_id=lease.unit_id, period_year=year, period_month=month).first()
        if existing_period:
            return Response({'detail': 'An invoice already exists for this lease period.', 'invoice_id': str(existing_period.invoice_id)}, status=409)

        due_day = min(lease.rent_due_day, monthrange(year, month)[1])
        invoice = RentInvoice.objects.create(
            invoice_number=_next_invoice_number(), landlord_id=context['owner_id'], renter_user_id=lease.renter_user_id,
            renter_assoc_id=lease.renter_assoc_id, listing_id=lease.listing_id, unit_id=lease.unit_id,
            billing_period_start=period_start, billing_period_end=period_end, due_date=date(year, month, due_day),
            amount_kes=lease.monthly_rent_kes, currency='KES', status='DUE',
        )
        RentInvoicePeriod.objects.create(
            invoice_id=invoice.id, renter_assoc_id=lease.renter_assoc_id, unit_id=lease.unit_id,
            period_year=year, period_month=month, amount_kes=lease.monthly_rent_kes,
        )
        return Response({'id': str(invoice.id), 'invoice_number': invoice.invoice_number, 'lease_id': str(lease.id), 'billing_period_start': period_start, 'billing_period_end': period_end, 'due_date': date(year, month, due_day), 'amount_kes': float(invoice.amount_kes), 'status': invoice.status}, status=201)
