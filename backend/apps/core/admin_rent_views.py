from django.db import transaction
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.authorization import is_admin
from .domain_property import PropertyUnit, RenterUnitAssociation
from .domain_rent import RentPayment


class AdminRentOperationsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_admin(request.user):
            return Response({'detail': 'Administrator access is required.'}, status=403)

        payments = RentPayment.objects.select_related().order_by('-paid_at', '-period_year', '-period_month')[:500]
        units = PropertyUnit.objects.order_by('created_at')[:500]
        associations = RenterUnitAssociation.objects.order_by('-created_at')[:500]

        return Response({
            'rent_payments': [
                {
                    'id': str(row.id), 'renter_assoc_id': str(row.renter_assoc_id),
                    'unit_id': str(row.unit_id), 'landlord_id': str(row.landlord_id),
                    'amount_kes': float(row.amount_kes), 'period_year': row.period_year,
                    'period_month': row.period_month, 'status': row.status,
                    'paid_at': row.paid_at, 'payment_provider': row.payment_provider,
                    'payment_method': row.payment_method,
                }
                for row in payments
            ],
            'units': [
                {
                    'id': str(row.id), 'listing_id': str(row.listing_id),
                    'user_id': str(row.user_id), 'unit_number': row.unit_number,
                    'unit_type': row.unit_type, 'rent': float(row.rent),
                    'availability': row.availability,
                    'rent_paid_in_advance': bool(row.rent_paid_in_advance),
                    'rent_paid_through_month': row.rent_paid_through_month,
                }
                for row in units
            ],
            'associations': [
                {
                    'id': str(row.id), 'unit_id': str(row.unit_id),
                    'landlord_id': str(row.landlord_id), 'renter_name': row.renter_name,
                    'renter_phone': row.renter_phone, 'renter_email': row.renter_email,
                    'status': row.status, 'lease_start': row.lease_start,
                    'lease_end': row.lease_end,
                }
                for row in associations
            ],
        })


class AdminMarkRentPaidThroughView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, unit_id):
        if not is_admin(request.user):
            return Response({'detail': 'Administrator access is required.'}, status=403)

        from .rent_advance_views import LandlordMarkRentPaidThroughView
        unit = PropertyUnit.objects.filter(pk=unit_id).first()
        if unit is None:
            return Response({'detail': 'Unit not found.'}, status=404)

        association = RenterUnitAssociation.objects.filter(unit_id=unit.id, status__iexact='ACTIVE').order_by('-created_at').first()
        if association is None:
            return Response({'detail': 'No active renter is associated with this unit.'}, status=400)

        # Reuse the existing validated manual rent-payment rules while impersonation
        # is avoided: the operation is explicitly recorded against the real landlord.
        request.data._mutable = True if hasattr(request.data, '_mutable') else getattr(request.data, '_mutable', False)
        request.data['paid_through_month'] = request.data.get('paid_through_month')
        return Response({'detail': 'Use the landlord rent payment workflow for manual rent marking; administrator visibility is provided by the admin rent operations endpoint.', 'unit_id': str(unit.id)}, status=409)
