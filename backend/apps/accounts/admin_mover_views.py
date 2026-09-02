from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.authorization import is_admin
from apps.core.domain_platform import Mover


MOVER_FIELDS = (
    'id', 'user_id', 'driver_full_name', 'business_name', 'national_id', 'dl_number',
    'dl_photo_url', 'vehicle_type', 'number_plate', 'operating_city', 'operating_county',
    'phone', 'profile_photo_url', 'base_rate_kes', 'capacity_details', 'is_available',
    'approval_status', 'working_days', 'start_time', 'end_time', 'payment_channel',
    'payment_account', 'liability_accepted', 'reference_contacts', 'created_at', 'updated_at',
    'rate_per_km_kes', 'insurance_policy_details', 'vehicle_inspection_expiry', 'terms_accepted',
    'current_latitude', 'current_longitude', 'location_updated_at', 'location',
)


def serialize_mover(mover):
    return {field: getattr(mover, field) for field in MOVER_FIELDS}


class AdminMoverDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _get(self, request, mover_id):
        if not is_admin(request.user):
            return None, Response({'detail': 'Administrator access is required.'}, status=403)
        mover = Mover.objects.filter(pk=mover_id).first()
        if not mover:
            return None, Response({'detail': 'Mover not found.'}, status=404)
        return mover, None

    def get(self, request, mover_id):
        mover, error = self._get(request, mover_id)
        if error:
            return error
        return Response(serialize_mover(mover))

    def patch(self, request, mover_id):
        mover, error = self._get(request, mover_id)
        if error:
            return error

        if 'approval_status' in request.data:
            approval_status = str(request.data.get('approval_status') or '').strip().lower()
            if approval_status not in {'pending_review', 'approved', 'rejected'}:
                return Response({'detail': 'Invalid mover approval status.'}, status=400)
            mover.approval_status = approval_status

        if 'is_available' in request.data:
            mover.is_available = bool(request.data.get('is_available'))

        mover.updated_at = timezone.now()
        mover.save(update_fields=['approval_status', 'is_available', 'updated_at'])
        return Response(serialize_mover(mover))
