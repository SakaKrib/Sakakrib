from calendar import monthrange
from datetime import date
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.domain_property import PropertyUnit
from apps.core.domain_rent import RentInvoice, RentInvoicePeriod, RentPaymentSubmission

from .models import RealEstatePMSLease, RealEstatePMSListingAssignment
from .services import get_real_estate_pms_context


def _context(user):
    return get_real_estate_pms_context(user)


def _unit_scope(user, context):
    qs = PropertyUnit.objects.filter(user_id=context['owner_id'])
    if context.get('pms_role') == 'AGENT':
        qs = qs.filter(listing_id__in=RealEstatePMSListingAssignment.objects.filter(
            real_estate_id=context['owner_id'], agent_id=user.id, is_active=True
        ).values('listing_id'))
    return qs


def _next_invoice_number():
    prefix = f'RE-{timezone.localdate().strftime("%Y%m%d")}'
    count = RentInvoice.objects.filter(invoice_number__startswith=prefix).count() + 1
    return f'{prefix}-{count:04d}'


class RealEstatePMSFinanceView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        context = _context(request.user)
        if not context:
            return Response({'detail': 'Real-estate PMS access is required.'}, status=403)
        units = _unit_scope(request.user, context)
        unit_ids = list(units.values_list('id', flat=True))
        invoices = RentInvoice.objects.filter(landlord_id=context['owner_id'], unit_id__in=unit_ids).order_by('-due_date', '-created_at')
        submissions = RentPaymentSubmission.objects.filter(landlord_id=context['owner_id'], unit_id__in=unit_ids).order_by('-submitted_at')
        invoice_rows = [{
            'id': str(row.id), 'invoice_number': row.invoice_number, 'unit_id': str(row.unit_id),
            'listing_id': str(row.listing_id), 'renter_user_id': str(row.renter_user_id),
            'amount_kes': float(row.amount_kes), 'currency': row.currency, 'status': row.status,
            'billing_period_start': row.billing_period_start, 'billing_period_end': row.billing_period_end,
            'due_date': row.due_date, 'payment_method': row.payment_method,
            'transaction_reference': row.transaction_reference, 'payment_date': row.payment_date,
            'paid_at': row.paid_at, 'created_at': row.created_at,
        } for row in invoices]
        submission_rows = [{
            'id': str(row.id), 'invoice_id': str(row.invoice_id), 'unit_id': str(row.unit_id),
            'transaction_reference': row.transaction_reference, 'payment_method': row.payment_method,
            'payment_date': row.payment_date, 'status': row.status, 'submitted_at': row.submitted_at,
            'rejection_reason': row.rejection_reason,
        } for row in submissions]
        total_invoiced = sum(Decimal(str(row.amount_kes)) for row in invoices)
        total_paid = sum(Decimal(str(row.amount_kes)) for row in invoices if str(row.status).upper() in {'PAID', 'PARTIALLY_PAID'})
        total_due = total_invoiced - total_paid
        return Response({
            'summary': {
                'units': len(unit_ids), 'invoices': len(invoice_rows),
                'total_invoiced_kes': float(total_invoiced), 'total_paid_kes': float(total_paid),
                'total_due_kes': float(total_due),
                'pending_submissions': sum(str(row.status).upper() == 'PENDING' for row in submissions),
            },
            'invoices': invoice_rows,
            'payment_submissions': submission_rows,
            'pms_role': context.get('pms_role'),
        })

    @transaction.atomic
    def post(self, request):
        context = _context(request.user)
        if not context or context.get('subscription').status == 'GRACE_PERIOD':
            return Response({'detail': 'An active real-estate PMS subscription is required for finance changes.'}, status=403)
        if context.get('pms_role') not in ('ADMIN', 'TEAM_MANAGER'):
            return Response({'detail': 'You are not authorized to create invoices.'}, status=403)

        unit = PropertyUnit.objects.filter(pk=request.data.get('unit_id'), user_id=context['owner_id']).first()
        if not unit:
            return Response({'detail': 'Unit not found.'}, status=404)
        lease = RealEstatePMSLease.objects.filter(
            unit_id=unit.id, real_estate_id=context['owner_id'], status=RealEstatePMSLease.STATUS_ACTIVE
        ).first()
        if not lease:
            return Response({'detail': 'Create an active lease for this unit before generating rent invoices.'}, status=409)
        if not lease.renter_user_id:
            return Response({'detail': 'The renter must have a claimed SakaKrib account before an invoice can be generated.'}, status=409)

        if request.data.get('year') and request.data.get('month'):
            try:
                year = int(request.data.get('year'))
                month = int(request.data.get('month'))
                period_start = date(year, month, 1)
            except (TypeError, ValueError):
                return Response({'detail': 'Invoice year or month is invalid.'}, status=400)
        else:
            period_start = timezone.localdate().replace(day=1)
            year, month = period_start.year, period_start.month
        period_end = date(year, month, monthrange(year, month)[1])

        if period_end < lease.lease_start or (lease.lease_end and period_start > lease.lease_end):
            return Response({'detail': 'The requested billing period is outside the lease term.'}, status=409)
        if RentInvoicePeriod.objects.filter(
            renter_assoc_id=lease.renter_assoc_id, unit_id=lease.unit_id,
            period_year=year, period_month=month,
        ).exists():
            return Response({'detail': 'An invoice already exists for this lease period.'}, status=409)

        due_day = min(lease.rent_due_day, monthrange(year, month)[1])
        invoice = RentInvoice.objects.create(
            invoice_number=_next_invoice_number(), landlord_id=context['owner_id'],
            renter_user_id=lease.renter_user_id, renter_assoc_id=lease.renter_assoc_id,
            listing_id=lease.listing_id, unit_id=lease.unit_id,
            billing_period_start=period_start, billing_period_end=period_end,
            due_date=date(year, month, due_day), amount_kes=lease.monthly_rent_kes,
            currency='KES', status='DUE',
        )
        RentInvoicePeriod.objects.create(
            invoice_id=invoice.id, renter_assoc_id=lease.renter_assoc_id,
            unit_id=lease.unit_id, period_year=year, period_month=month,
            amount_kes=lease.monthly_rent_kes,
        )
        return Response({'id': str(invoice.id), 'invoice_number': invoice.invoice_number, 'lease_id': str(lease.id), 'status': invoice.status}, status=201)
