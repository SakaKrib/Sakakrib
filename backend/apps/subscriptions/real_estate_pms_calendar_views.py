from datetime import date, timedelta

from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.domain_property import PropertyUnit, RenterUnitAssociation
from apps.core.domain_rent import RentInvoice, RentPaymentSubmission

from .models import RealEstatePMSListingAssignment
from .services import get_real_estate_pms_context


def _parse_date(value, fallback):
    try:
        return date.fromisoformat(str(value)) if value else fallback
    except (TypeError, ValueError):
        return fallback


def _unit_scope(user, context):
    units = PropertyUnit.objects.filter(user_id=context['owner_id'])
    if context.get('pms_role') == 'AGENT':
        units = units.filter(
            listing_id__in=RealEstatePMSListingAssignment.objects.filter(
                real_estate_id=context['owner_id'], agent_id=user.id, is_active=True
            ).values('listing_id')
        )
    return units


def _event(event_id, event_date, event_type, label, detail, unit=None, invoice=None, status=None):
    return {
        'id': event_id,
        'date': event_date,
        'type': event_type,
        'label': label,
        'detail': detail,
        'unit_id': str(unit.id) if unit else None,
        'listing_id': str(unit.listing_id) if unit else None,
        'invoice_id': str(invoice.id) if invoice else None,
        'status': status,
    }


class RealEstatePMSCalendarView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        context = get_real_estate_pms_context(request.user)
        if not context:
            return Response({'detail': 'Real-estate PMS access is required.'}, status=403)

        today = timezone.localdate()
        default_start = today.replace(day=1)
        requested_start = _parse_date(request.query_params.get('start'), default_start)
        requested_end = _parse_date(request.query_params.get('end'), requested_start + timedelta(days=42))
        if requested_end < requested_start:
            return Response({'detail': 'Calendar end date cannot be before the start date.'}, status=400)

        units = _unit_scope(request.user, context)
        unit_map = {str(unit.id): unit for unit in units}
        unit_ids = list(unit_map.keys())
        events = []

        associations = RenterUnitAssociation.objects.filter(
            landlord_id=context['owner_id'], unit_id__in=unit_ids
        ).order_by('lease_start', 'created_at')
        for association in associations:
            unit = unit_map.get(str(association.unit_id))
            if not unit:
                continue
            renter = association.renter_name or association.renter_email or 'Renter'
            if association.lease_start:
                events.append(_event(
                    f'lease-start-{association.id}', association.lease_start, 'LEASE_START',
                    'Lease starts', f'{unit.unit_number or "Unit"} · {renter}', unit=unit,
                    status=str(association.status).upper(),
                ))
            if association.lease_end:
                events.append(_event(
                    f'lease-end-{association.id}', association.lease_end, 'LEASE_END',
                    'Lease ends', f'{unit.unit_number or "Unit"} · {renter}', unit=unit,
                    status=str(association.status).upper(),
                ))
                renewal_date = association.lease_end - timedelta(days=30)
                events.append(_event(
                    f'lease-renewal-{association.id}', renewal_date, 'LEASE_RENEWAL',
                    'Lease renewal reminder', f'{unit.unit_number or "Unit"} · {renter}', unit=unit,
                    status=str(association.status).upper(),
                ))

        invoices = RentInvoice.objects.filter(
            landlord_id=context['owner_id'], unit_id__in=unit_ids
        ).order_by('due_date', 'created_at')
        invoice_map = {invoice.id: invoice for invoice in invoices}
        paid_invoice_ids = set()
        for invoice in invoices:
            unit = unit_map.get(str(invoice.unit_id))
            if not unit:
                continue
            amount = f'KES {invoice.amount_kes:,.2f}'
            status = str(invoice.status or '').upper()
            if status in {'PAID', 'PARTIALLY_PAID'}:
                paid_invoice_ids.add(invoice.id)
            if invoice.due_date:
                label = 'Rent due' if status not in {'PAID', 'PARTIALLY_PAID'} else 'Rent payment'
                events.append(_event(
                    f'rent-due-{invoice.id}', invoice.due_date, 'RENT_DUE', label,
                    f'{unit.unit_number or "Unit"} · {amount} · {invoice.invoice_number}',
                    unit=unit, invoice=invoice, status=status,
                ))
            if status in {'DUE', 'OVERDUE', 'PARTIALLY_PAID'} and invoice.due_date and invoice.due_date < today:
                events.append(_event(
                    f'overdue-{invoice.id}', invoice.due_date, 'OVERDUE', 'Overdue rent',
                    f'{unit.unit_number or "Unit"} · {amount} · {invoice.invoice_number}',
                    unit=unit, invoice=invoice, status='OVERDUE',
                ))
            if invoice.paid_at or invoice.payment_date:
                paid_date = invoice.paid_at.date() if invoice.paid_at else invoice.payment_date
                events.append(_event(
                    f'payment-{invoice.id}', paid_date, 'PAYMENT_RECEIVED', 'Payment received',
                    f'{unit.unit_number or "Unit"} · {amount} · {invoice.invoice_number}',
                    unit=unit, invoice=invoice, status=status,
                ))

        submissions = RentPaymentSubmission.objects.filter(
            landlord_id=context['owner_id'], unit_id__in=unit_ids, status__iexact='CONFIRMED'
        ).order_by('payment_date', 'submitted_at')
        for submission in submissions:
            if submission.invoice_id not in invoice_map or submission.invoice_id in paid_invoice_ids or not submission.payment_date:
                continue
            unit = unit_map.get(str(submission.unit_id))
            if not unit:
                continue
            events.append(_event(
                f'submission-{submission.id}', submission.payment_date, 'PAYMENT_RECEIVED',
                'Payment confirmed',
                f'{unit.unit_number or "Unit"} · {submission.transaction_reference or "Payment"}',
                unit=unit, status='CONFIRMED',
            ))

        in_range = [
            event for event in events
            if event['date'] and requested_start <= event['date'] <= requested_end
        ]
        in_range.sort(key=lambda event: (event['date'], event['label'], event['id']))
        return Response({
            'start': requested_start,
            'end': requested_end,
            'events': in_range,
            'pms_role': context.get('pms_role'),
        })
