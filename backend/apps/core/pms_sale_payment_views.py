"""Manual payment records for units that are for sale (landlord and real-estate PMS)."""
from datetime import date
from decimal import Decimal, InvalidOperation

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.listings.models import Listing

from .domain_property import PropertyUnit, SalePaymentRecord
from .rent_views import _pms_actor


def _payload(row, unit=None, listing=None):
    return {
        'id': str(row.id), 'unit_id': str(row.unit_id), 'listing_id': str(row.listing_id),
        'unit_number': unit.unit_number if unit else None, 'listing_title': listing.title if listing else '',
        'buyer_name': row.buyer_name, 'buyer_phone': row.buyer_phone, 'amount_kes': float(row.amount_kes),
        'payment_method': row.payment_method, 'transaction_reference': row.transaction_reference,
        'payment_date': row.payment_date, 'note': row.note, 'created_at': row.created_at,
    }


class PMSSalePaymentView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        owner_id, denied = _pms_actor(request)
        if denied:
            return denied
        rows = list(SalePaymentRecord.objects.filter(owner_id=owner_id)[:200])
        units = {u.id: u for u in PropertyUnit.objects.filter(id__in={r.unit_id for r in rows})}
        listings = {l.id: l for l in Listing.objects.filter(id__in={r.listing_id for r in rows})}
        return Response({
            'payments': [_payload(r, units.get(r.unit_id), listings.get(r.listing_id)) for r in rows],
            'sale_units': [
                {'unit_id': str(u.id), 'listing_id': str(u.listing_id), 'unit_number': u.unit_number,
                 'sale_price': float(u.sale_price) if u.sale_price is not None else None,
                 'installment_total_price': float(u.installment_total_price) if u.installment_total_price is not None else None}
                for u in PropertyUnit.objects.filter(user_id=owner_id, listing_type='sale').order_by('unit_number')
            ],
        })

    def post(self, request):
        owner_id, denied = _pms_actor(request)
        if denied:
            return denied
        unit = PropertyUnit.objects.filter(pk=request.data.get('unit_id'), user_id=owner_id, listing_type='sale').first()
        if unit is None:
            return Response({'detail': 'Choose a unit that is listed for sale.'}, status=400)
        buyer = str(request.data.get('buyer_name') or '').strip()
        if len(buyer) < 2:
            return Response({'detail': 'The buyer name is required.'}, status=400)
        try:
            amount = Decimal(str(request.data.get('amount_kes')))
            if amount <= 0:
                raise InvalidOperation
        except (InvalidOperation, TypeError):
            return Response({'detail': 'Enter a payment amount greater than zero.'}, status=400)
        try:
            paid_on = date.fromisoformat(str(request.data.get('payment_date') or date.today().isoformat()))
        except ValueError:
            return Response({'detail': 'The payment date is invalid.'}, status=400)
        reference = str(request.data.get('transaction_reference') or '').strip()[:120]
        if not reference:
            return Response({'detail': 'A transaction ID or receipt number is required.'}, status=400)
        row = SalePaymentRecord.objects.create(
            owner_id=owner_id, listing_id=unit.listing_id, unit_id=unit.id, buyer_name=buyer[:160],
            buyer_phone=str(request.data.get('buyer_phone') or '').strip()[:40], amount_kes=amount,
            payment_method=str(request.data.get('payment_method') or '').strip()[:60], transaction_reference=reference,
            payment_date=paid_on, note=str(request.data.get('note') or '').strip()[:500], recorded_by=request.user.id,
        )
        listing = Listing.objects.filter(pk=unit.listing_id).first()
        return Response(_payload(row, unit, listing), status=201)

    def delete(self, request, payment_id=None):
        owner_id, denied = _pms_actor(request)
        if denied:
            return denied
        deleted, _ = SalePaymentRecord.objects.filter(pk=payment_id, owner_id=owner_id).delete()
        return Response(status=204) if deleted else Response({'detail': 'Payment record not found.'}, status=404)
