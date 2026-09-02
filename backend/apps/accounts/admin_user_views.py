from django.db import transaction
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.authorization import is_admin
from apps.core.domain_platform import Mover
from apps.core.domain_property import ListingMedia
from apps.listings.models import Listing
from apps.listings.serializers import ListingSerializer
from apps.subscriptions.models import LandlordSubscription, RealEstateSubscription, SubscriptionPlan

from .models import Profile
from .serializers import ProfileSerializer


APPLICATION_FIELDS = {
    'landlord': 'landlord_application_status',
    'real_estate': 'real_estate_application_status',
}
ALLOWED_APPLICATION_STATUSES = {'pending', 'approved', 'rejected'}


class AdminUserDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _require_admin(self, request):
        if not is_admin(request.user):
            return Response({'detail': 'Administrator access is required.'}, status=403)
        return None

    @staticmethod
    def _plan_payload(plan):
        if not plan:
            return None
        return {
            'id': str(plan.id),
            'name': plan.name,
            'audience': plan.audience,
            'max_listings': plan.max_listings,
            'max_units_per_listing': plan.max_units_per_listing,
            'monthly_price_kes': plan.monthly_price_kes,
            'annual_price_kes': plan.annual_price_kes,
        }

    @classmethod
    def _subscription_payload(cls, subscription, plan):
        if not subscription:
            return None
        data = {
            'id': str(subscription.id),
            'plan_id': str(subscription.plan_id),
            'billing_cycle': subscription.billing_cycle,
            'status': subscription.status,
            'current_period_start': subscription.current_period_start,
            'current_period_end': subscription.current_period_end,
            'grace_period_end': subscription.grace_period_end,
            'auto_renew': subscription.auto_renew,
            'created_at': subscription.created_at,
            'updated_at': subscription.updated_at,
            'paypal_subscription_id': subscription.paypal_subscription_id,
            'paypal_plan_id': subscription.paypal_plan_id,
            'paypal_status': subscription.paypal_status,
            'next_billing_at': subscription.next_billing_at,
            'cancel_at_period_end': subscription.cancel_at_period_end,
            'cancelled_at': subscription.cancelled_at,
            'billing_amount_kes': subscription.billing_amount_kes,
            'billing_amount_usd': subscription.billing_amount_usd,
            'billing_exchange_rate': subscription.billing_exchange_rate,
            'billing_exchange_rate_timestamp': subscription.billing_exchange_rate_timestamp,
            'plan': cls._plan_payload(plan),
        }
        owner_field = 'landlord_id' if isinstance(subscription, LandlordSubscription) else 'real_estate_id'
        data[owner_field] = str(getattr(subscription, owner_field))
        return data

    @staticmethod
    def _mover_payload(mover):
        if not mover:
            return None
        fields = (
            'id', 'user_id', 'driver_full_name', 'business_name', 'national_id', 'dl_number',
            'dl_photo_url', 'vehicle_type', 'number_plate', 'operating_city', 'operating_county',
            'phone', 'profile_photo_url', 'base_rate_kes', 'capacity_details', 'is_available',
            'approval_status', 'working_days', 'start_time', 'end_time', 'payment_channel',
            'payment_account', 'liability_accepted', 'reference_contacts', 'created_at',
            'updated_at', 'rate_per_km_kes', 'insurance_policy_details', 'vehicle_inspection_expiry',
            'terms_accepted', 'current_latitude', 'current_longitude', 'location_updated_at', 'location',
        )
        return {field: getattr(mover, field) for field in fields}

    def get(self, request, user_id):
        denied = self._require_admin(request)
        if denied:
            return denied

        profile = Profile.objects.filter(pk=user_id).first()
        if not profile:
            return Response({'detail': 'User profile was not found.'}, status=404)

        payload = {
            'profile': ProfileSerializer(profile).data,
            'movers': [self._mover_payload(m) for m in Mover.objects.filter(user_id=profile.id).order_by('-created_at')],
            'listings': ListingSerializer(
                Listing.objects.filter(user_id=profile.id).order_by('-updated_at', '-created_at'),
                many=True,
                context={'request': request},
            ).data,
            'landlord_subscription': None,
            'real_estate_subscription': None,
        }

        if profile.role == 'landlord':
            subscription = LandlordSubscription.objects.filter(landlord_id=profile.id).order_by('-created_at').first()
            plan = SubscriptionPlan.objects.filter(pk=getattr(subscription, 'plan_id', None)).first() if subscription else None
            payload['landlord_subscription'] = self._subscription_payload(subscription, plan)
        elif profile.role == 'real_estate':
            subscription = RealEstateSubscription.objects.filter(real_estate_id=profile.id).order_by('-created_at').first()
            plan = SubscriptionPlan.objects.filter(pk=getattr(subscription, 'plan_id', None)).first() if subscription else None
            payload['real_estate_subscription'] = self._subscription_payload(subscription, plan)

        return Response(payload)

    def patch(self, request, user_id):
        denied = self._require_admin(request)
        if denied:
            return denied

        profile = Profile.objects.filter(pk=user_id).first()
        if not profile:
            return Response({'detail': 'User profile was not found.'}, status=404)

        application_type = str(request.data.get('application_type') or '').strip().lower()
        status_value = str(request.data.get('status') or '').strip().lower()
        note = request.data.get('admin_review_note')
        if note is not None:
            note = str(note).strip()

        if application_type not in APPLICATION_FIELDS:
            return Response({'detail': 'application_type must be landlord or real_estate.'}, status=400)
        if status_value not in ALLOWED_APPLICATION_STATUSES:
            return Response({'detail': 'status must be pending, approved, or rejected.'}, status=400)

        field = APPLICATION_FIELDS[application_type]
        with transaction.atomic():
            locked = Profile.objects.select_for_update().get(pk=profile.pk)
            setattr(locked, field, status_value)
            locked.admin_review_note = note or ''
            if status_value == 'approved':
                locked.verification_status = 'verified'
                locked.kyc_completed = True
            elif status_value == 'rejected':
                locked.verification_status = 'rejected'
                locked.kyc_completed = False
            else:
                locked.verification_status = 'pending_verification'
                locked.kyc_completed = False
            locked.updated_at = timezone.now()
            locked.save(update_fields=[field, 'admin_review_note', 'verification_status', 'kyc_completed', 'updated_at'])

        return Response(ProfileSerializer(locked).data)


class AdminUserMoverView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, mover_id):
        if not is_admin(request.user):
            return Response({'detail': 'Administrator access is required.'}, status=403)

        mover = Mover.objects.filter(pk=mover_id).first()
        if not mover:
            return Response({'detail': 'Mover not found.'}, status=404)

        if 'approval_status' in request.data:
            status_value = str(request.data.get('approval_status') or '').strip().lower()
            if status_value not in {'pending_review', 'approved', 'rejected'}:
                return Response({'detail': 'Invalid mover approval status.'}, status=400)
            mover.approval_status = status_value
        if 'is_available' in request.data:
            mover.is_available = bool(request.data.get('is_available'))
        mover.updated_at = timezone.now()
        mover.save(update_fields=['approval_status', 'is_available', 'updated_at'])
        return Response(AdminUserDetailView._mover_payload(mover))
