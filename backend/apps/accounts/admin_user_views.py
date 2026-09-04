from django.db import transaction
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.authorization import is_admin
from apps.core.domain_platform import Mover, MoverApplication
from apps.core.domain_property import ListingMedia
from apps.listings.models import Listing
from apps.listings.serializers import ListingSerializer
from apps.subscriptions.models import LandlordSubscription, RealEstateSubscription, SubscriptionPlan

from .application_status_service import set_application_status
from .models import Profile
from .serializers import ProfileSerializer


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

    @classmethod
    def _subscription_for_profile(cls, profile):
        if profile.role == 'landlord':
            subscription = LandlordSubscription.objects.filter(landlord_id=profile.id).order_by('-created_at').first()
        elif profile.role == 'real_estate':
            subscription = RealEstateSubscription.objects.filter(real_estate_id=profile.id).order_by('-created_at').first()
        else:
            return None
        plan = SubscriptionPlan.objects.filter(pk=getattr(subscription, 'plan_id', None)).first() if subscription else None
        return cls._subscription_payload(subscription, plan)

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

        # Explicit application decisions always go through the canonical
        # state-transition service. This prevents this general user-edit
        # endpoint from creating a second approval/KYC lifecycle.
        if application_type or status_value:
            if not application_type or not status_value:
                return Response({'detail': 'application_type and status must be supplied together.'}, status=400)
            try:
                locked = set_application_status(
                    admin_user=request.user,
                    user_id=profile.id,
                    application_type=application_type,
                    status_value=status_value,
                    note=note or '',
                )
            except PermissionError as exc:
                return Response({'detail': str(exc)}, status=403)
            except LookupError as exc:
                return Response({'detail': str(exc)}, status=404)
            except ValueError as exc:
                return Response({'detail': str(exc)}, status=400)
            return Response(ProfileSerializer(locked).data)

        # Keep ordinary profile editing separate from application/KYC state.
        # Application statuses, verification_status, kyc_status, kyc_completed,
        # and role are deliberately not writable through this generic endpoint.
        allowed_fields = {
            'full_name', 'email', 'phone', 'city', 'county',
        }
        updates = {key: request.data[key] for key in allowed_fields if key in request.data}
        if not updates:
            return Response({'detail': 'No supported profile fields were supplied.'}, status=400)
        if 'email' in updates:
            updates['email'] = str(updates['email']).strip()

        with transaction.atomic():
            locked = Profile.objects.select_for_update().get(pk=profile.pk)
            for key, value in updates.items():
                setattr(locked, key, value)
            locked.updated_at = timezone.now()
            locked.save(update_fields=[*updates.keys(), 'updated_at'])
        return Response(ProfileSerializer(locked).data)


class AdminDashboardDataView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_admin(request.user):
            return Response({'detail': 'Administrator access is required.'}, status=403)

        profiles = list(Profile.objects.all().order_by('-created_at'))
        profile_ids = [profile.id for profile in profiles]

        landlord_subscriptions = list(
            LandlordSubscription.objects.filter(landlord_id__in=profile_ids).order_by('-created_at')
        )
        real_estate_subscriptions = list(
            RealEstateSubscription.objects.filter(real_estate_id__in=profile_ids).order_by('-created_at')
        )
        all_subscriptions = [*landlord_subscriptions, *real_estate_subscriptions]
        plans = {
            plan.id: plan
            for plan in SubscriptionPlan.objects.filter(
                id__in=[subscription.plan_id for subscription in all_subscriptions]
            )
        }

        subscriptions = {}
        for subscription in all_subscriptions:
            owner_id = getattr(subscription, 'landlord_id', None) or getattr(subscription, 'real_estate_id', None)
            if owner_id not in subscriptions:
                subscriptions[owner_id] = AdminUserDetailView._subscription_payload(
                    subscription,
                    plans.get(subscription.plan_id),
                )

        movers = {}
        for mover in Mover.objects.filter(user_id__in=profile_ids).order_by('-created_at'):
            if mover.user_id not in movers:
                movers[mover.user_id] = AdminUserDetailView._mover_payload(mover)

        mover_applications = {}
        for application in MoverApplication.objects.filter(applicant_id__in=profile_ids).order_by('-created_at'):
            if application.applicant_id not in mover_applications:
                mover_applications[application.applicant_id] = {
                    'id': str(application.id),
                    'applicant_id': str(application.applicant_id),
                    'status': application.status,
                    'review_notes': application.review_notes,
                }

        items = []
        for profile in profiles:
            serialized_profile = ProfileSerializer(profile).data
            item = dict(serialized_profile)
            subscription = subscriptions.get(profile.id)
            item['profile'] = serialized_profile
            item['subscription'] = subscription
            item['landlord_subscription'] = subscription if profile.role == 'landlord' else None
            item['real_estate_subscription'] = subscription if profile.role == 'real_estate' else None
            item['moverApplication'] = mover_applications.get(profile.id)
            item['moverRecord'] = movers.get(profile.id)
            items.append(item)

        return Response({'items': items})


class AdminUserMoverView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, mover_id):
        if not is_admin(request.user):
            return Response({'detail': 'Administrator access is required.'}, status=403)

        mover = Mover.objects.filter(pk=mover_id).first()
        if not mover:
            return Response({'detail': 'Mover not found.'}, status=404)

        # Approval is part of the canonical application lifecycle. Direct
        # approval changes here would desynchronize Profile and MoverApplication.
        if 'approval_status' in request.data:
            status_value = str(request.data.get('approval_status') or '').strip().lower()
            application_status = 'pending' if status_value == 'pending_review' else status_value
            try:
                profile = Profile.objects.get(pk=mover.user_id)
                locked = set_application_status(
                    admin_user=request.user,
                    user_id=profile.id,
                    application_type='mover',
                    status_value=application_status,
                    note=request.data.get('admin_review_note') or '',
                )
                mover = Mover.objects.get(pk=mover.id)
            except Profile.DoesNotExist:
                return Response({'detail': 'Mover profile was not found.'}, status=404)
            except (PermissionError, LookupError, ValueError) as exc:
                return Response({'detail': str(exc)}, status=400)
            return Response(AdminUserDetailView._mover_payload(mover))

        # Availability alone is operational state, not an approval decision.
        if 'is_available' in request.data:
            mover.is_available = bool(request.data.get('is_available'))
            mover.updated_at = timezone.now()
            mover.save(update_fields=['is_available', 'updated_at'])
        return Response(AdminUserDetailView._mover_payload(mover))


class AdminUserMoverApplicationView(APIView):
    """Return the latest mover application for a given user (admin only)."""
    permission_classes = [IsAuthenticated]

    def get(self, request, user_id):
        if not is_admin(request.user):
            return Response({'detail': 'Administrator access is required.'}, status=403)

        application = MoverApplication.objects.filter(applicant_id=user_id).order_by('-created_at').first()
        if not application:
            return Response({'application': None}, status=200)

        data = {
            'id': str(application.id),
            'applicant_email': application.applicant_email,
            'applicant_name': application.applicant_name,
            'application_type': application.application_type,
            'base_rate_kes': application.base_rate_kes,
            'capacity_details': application.capacity_details,
            'dl_number': application.dl_number,
            'dl_photo_url': application.dl_photo_url,
            'driver_full_name': application.driver_full_name,
            'end_time': application.end_time.strftime('%H:%M') if application.end_time else None,
            'insurance_policy_details': application.insurance_policy_details,
            'latitude': application.latitude,
            'liability_accepted': application.liability_accepted,
            'location': application.location,
            'longitude': application.longitude,
            'national_id': application.national_id,
            'number_plate': application.number_plate,
            'operating_city': application.operating_city,
            'operating_county': application.operating_county,
            'payment_account': application.payment_account,
            'payment_channel': application.payment_channel,
            'phone': application.phone,
            'rate_per_km_kes': application.rate_per_km_kes,
            'reference_contacts': application.reference_contacts,
            'start_time': application.start_time.strftime('%H:%M') if application.start_time else None,
            'terms_accepted': application.terms_accepted,
            'vehicle_inspection_expiry': application.vehicle_inspection_expiry,
            'vehicle_type': application.vehicle_type,
            'working_days': application.working_days,
            'status': application.status,
            'submitted_at': application.submitted_at,
        }

        return Response({'application': data}, status=200)
