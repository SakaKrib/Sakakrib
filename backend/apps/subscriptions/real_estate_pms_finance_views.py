from decimal import Decimal, InvalidOperation
from datetime import date

from django.db import transaction
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.domain_property import PropertyUnit, RenterUnitAssociation
from apps.core.domain_rent import RentInvoice, RentInvoicePeriod, RentPaymentSubmission

from .models import RealEstatePMSListingAssignment
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
        association = RenterUnitAssociation.objects.filter(
            unit_id=unit.id, landlord_id=context['owner_id'], status__iexact='ACTIVE'
        ).order_by('-created_at').first()
        if not association:
            return Response({'detail': 'An active renter association is required to create an invoice.'}, status=409)
        if not association.renter_user_id:
            return Response({'detail': 'The renter must have a claimed SakaKrib account before an invoice can be generated.'}, status=409)

        try:
            amount = Decimal(str(request.data.get('amount_kes') or association.rent_amount or unit.rent))
            due_date = date.fromisoformat(str(request.data.get('due_date')))
            start = date.fromisoformat(str(request.data.get('billing_period_start')))
            end = date.fromisoformat(str(request.data.get('billing_period_end')))
        except (InvalidOperation, TypeError, ValueError):
            return Response({'detail': 'Invoice amount and dates are invalid.'}, status=400)
        if amount <= 0 or end < start:
            return Response({'detail': 'Invoice amount and billing period are invalid.'}, status=400)
        if RentInvoicePeriod.objects.filter(
            renter_assoc_id=association.id, unit_id=unit.id,
            period_year=start.year, period_month=start.month,
        ).exists():
            return Response({'detail': 'An invoice already exists for this rental period.'}, status=409)

        invoice = RentInvoice.objects.create(
            invoice_number=_next_invoice_number(), landlord_id=context['owner_id'],
            renter_user_id=association.renter_user_id, renter_assoc_id=association.id,
            listing_id=unit.listing_id, unit_id=unit.id, billing_period_start=start,
            billing_period_end=end, due_date=due_date, amount_kes=amount, currency='KES', status='DUE',
        )
        RentInvoicePeriod.objects.create(
            invoice_id=invoice.id, renter_assoc_id=association.id, unit_id=unit.id,
            period_year=start.year, period_month=start.month, amount_kes=amount,
        )
        return Response({'id': str(invoice.id), 'invoice_number': invoice.invoice_number, 'status': invoice.status}, status=201)
