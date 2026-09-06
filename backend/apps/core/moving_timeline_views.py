from django.db.models import Q
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.authorization import is_admin
from .access_scopes import bookings_for_user
from .domain_bookings import (
    Booking,
    MovingCancellationEvent,
    MovingDispute,
    MovingInvoice,
    MovingPayment,
    MoverPayout,
    MoverScheduleEvent,
)
from .domain_financial import MovingFinancialDocument
from .domain_platform import Mover


def _event(event_type, occurred_at, title, description='', status=None, amount=None, metadata=None):
    if occurred_at is None:
        return None
    return {
        'type': event_type,
        'occurred_at': occurred_at,
        'title': title,
        'description': description,
        'status': status,
        'amount_kes': amount,
        'metadata': metadata or {},
    }


def _booking_ids_for_user(user):
    if is_admin(user):
        return Booking.objects.all()
    return bookings_for_user(user)


def _timeline_for_booking(booking):
    booking_id = booking.id
    events = []

    events.append(_event('BOOKING_REQUESTED', booking.requested_at or booking.created_at,
                         'Booking requested', 'Moving booking request created.', booking.status))
    events.append(_event('BOOKING_CONFIRMED', booking.confirmed_at,
                         'Mover confirmed booking', 'The moving booking was confirmed.', 'confirmed'))
    events.append(_event('SCHEDULED', booking.scheduled_start_at,
                         'Moving job scheduled', 'The scheduled moving window begins.', 'scheduled',
                         metadata={'scheduled_end_at': booking.scheduled_end_at}))
    events.append(_event('JOURNEY_STARTED', booking.started_at,
                         'Journey started', 'The mover started the moving journey.', 'in_progress'))
    events.append(_event('BOOKING_COMPLETED', booking.completed_at,
                         'Booking completed', 'The moving booking was completed.', 'completed'))
    events.append(_event('BOOKING_CANCELLED', booking.cancelled_at,
                         'Booking cancelled', booking.cancellation_reason or booking.cancellation_details or '', 'cancelled'))
    events.append(_event('DELIVERY_CONFIRMED_BY_RENTER', booking.renter_confirmed_delivery_at,
                         'Renter confirmed delivery', 'Delivery confirmation was recorded by the renter.', 'confirmed'))
    events.append(_event('DELIVERY_CONFIRMED_BY_MOVER', booking.mover_confirmed_delivery_at,
                         'Mover confirmed delivery', 'Delivery confirmation was recorded by the mover.', 'confirmed'))

    payment = MovingPayment.objects.filter(booking_id=booking_id).order_by('-created_at').first()
    if payment:
        events.append(_event('PAYMENT_INITIATED', payment.created_at,
                             'Payment initiated', f'{payment.provider} payment created.', payment.status,
                             payment.amount_kes, {'payment_id': str(payment.id), 'provider': payment.provider,
                                                  'provider_reference': payment.provider_reference}))
        events.append(_event('PAYMENT_CONFIRMED', payment.paid_at,
                             'Payment confirmed', 'Provider payment confirmation received.', 'PAID',
                             payment.amount_kes, {'payment_id': str(payment.id), 'provider_transaction_id': payment.provider_transaction_id,
                                                  'mpesa_receipt': payment.mpesa_receipt, 'paypal_order_id': payment.paypal_order_id}))
        events.append(_event('PAYMENT_HELD', payment.paid_at if payment.status in {'HELD', 'RELEASED'} else None,
                             'Payment held in escrow', 'Confirmed payment was placed into the Saka Krib escrow lifecycle.', 'HELD',
                             payment.amount_kes, {'payment_id': str(payment.id)}))
        events.append(_event('ESCROW_RELEASE_AUTHORIZED', payment.released_at,
                             'Escrow release authorized', 'Escrow release was recorded; mover payout remains subject to provider confirmation.', 'RELEASED',
                             payment.amount_kes, {'payment_id': str(payment.id)}))

    invoice = MovingInvoice.objects.filter(booking_id=booking_id).first()
    if invoice:
        events.append(_event('INVOICE_ISSUED', invoice.created_at,
                             'Moving invoice issued', invoice.invoice_number, invoice.status,
                             invoice.amount_kes, {'invoice_number': invoice.invoice_number}))
        events.append(_event('INVOICE_PAID', invoice.paid_at,
                             'Moving invoice paid', 'Payment was confirmed against the moving invoice.', 'PAID',
                             invoice.amount_kes, {'invoice_number': invoice.invoice_number}))
        # RELEASED here means escrow release recorded on the invoice, not provider-confirmed mover payout.
        events.append(_event('INVOICE_RELEASE_RECORDED', invoice.released_at,
                             'Escrow release recorded', 'The invoice records the escrow release stage.', 'RELEASED',
                             invoice.amount_kes, {'invoice_number': invoice.invoice_number}))

    for document in MovingFinancialDocument.objects.filter(booking_id=booking_id).order_by('created_at'):
        label = 'Renter receipt' if document.document_type == 'RENTER_RECEIPT' else 'Mover settlement'
        events.append(_event('FINANCIAL_DOCUMENT_ISSUED', document.issued_at,
                             f'{label} issued', document.document_number, document.status,
                             document.amount_kes, {'document_id': str(document.id), 'document_type': document.document_type}))
        events.append(_event('FINANCIAL_DOCUMENT_PAID', document.paid_at,
                             f'{label} marked paid', document.document_number, 'PAID',
                             document.amount_kes, {'document_id': str(document.id), 'document_type': document.document_type}))
        if document.document_type == 'MOVER_SETTLEMENT':
            events.append(_event('MOVER_SETTLEMENT_RELEASED', document.released_at,
                                 'Mover settlement released', 'Settlement was finalized after payout provider confirmation.', 'RELEASED',
                                 document.mover_net_kes, {'document_id': str(document.id), 'document_number': document.document_number}))

    payout = MoverPayout.objects.filter(booking_id=booking_id).first()
    if payout:
        events.append(_event('PAYOUT_CREATED', payout.created_at,
                             'Mover payout created', 'Mover payout record created and funds remain controlled by the escrow lifecycle.', payout.final_payment_status,
                             payout.net_mover_payable, {'payout_id': str(payout.id), 'channel': payout.payment_channel}))
        events.append(_event('PAYOUT_REQUESTED', payout.payout_requested_at,
                             'Mover payout requested', 'Payout request was submitted to the payout provider.', 'processing',
                             payout.net_mover_payable, {'payout_id': str(payout.id), 'provider': payout.payout_provider,
                                                       'provider_reference': payout.payout_provider_reference}))
        events.append(_event('PAYOUT_PROVIDER_CONFIRMED', payout.payout_completed_at,
                             'Mover payout provider confirmed', 'The payout provider confirmed the mover payout.', 'released',
                             payout.net_mover_payable, {'payout_id': str(payout.id),
                                                       'provider_transaction_id': payout.payout_provider_transaction_id}))

    for schedule in MoverScheduleEvent.objects.filter(booking_id=booking_id):
        events.append(_event('SCHEDULE_EVENT', schedule.created_at,
                             'Schedule record created', schedule.title, schedule.status,
                             metadata={'schedule_id': str(schedule.id), 'starts_at': schedule.starts_at, 'ends_at': schedule.ends_at}))

    for cancellation in MovingCancellationEvent.objects.filter(booking_id=booking_id):
        events.append(_event('CANCELLATION_EVENT', cancellation.created_at,
                             'Cancellation recorded', cancellation.reason_text or cancellation.reason_code, 'cancelled',
                             metadata={'cancellation_id': str(cancellation.id), 'reason_code': cancellation.reason_code,
                                       'cancelled_by': str(cancellation.cancelled_by)}))

    for dispute in MovingDispute.objects.filter(booking_id=booking_id).order_by('opened_at'):
        events.append(_event('DISPUTE_OPENED', dispute.opened_at,
                             'Dispute opened', dispute.description, 'OPEN',
                             metadata={'dispute_id': str(dispute.id), 'reason_code': dispute.reason_code}))
        events.append(_event('DISPUTE_RESOLVED', dispute.resolved_at,
                             'Dispute resolved', dispute.resolution_notes or dispute.resolution_code or '', 'RESOLVED',
                             metadata={'dispute_id': str(dispute.id), 'resolution_code': dispute.resolution_code,
                                       'resolved_by': str(dispute.resolved_by) if dispute.resolved_by else None}))

    return sorted((item for item in events if item), key=lambda item: item['occurred_at'], reverse=True)


class MovingTransactionTimelineView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, booking_id=None):
        queryset = _booking_ids_for_user(request.user)
        if booking_id is not None:
            booking = queryset.filter(pk=booking_id).first()
            if booking is None:
                return Response({'detail': 'Not found.'}, status=404)
            return Response({
                'booking_id': str(booking.id),
                'status': booking.status,
                'payment_status': booking.payment_status,
                'dispute_status': booking.dispute_status,
                'events': _timeline_for_booking(booking),
            })

        bookings = queryset.order_by('-updated_at', '-created_at')[:100]
        return Response([
            {
                'booking_id': str(booking.id),
                'status': booking.status,
                'payment_status': booking.payment_status,
                'dispute_status': booking.dispute_status,
                'moving_date': booking.moving_date,
                'events': _timeline_for_booking(booking),
            }
            for booking in bookings
        ])
