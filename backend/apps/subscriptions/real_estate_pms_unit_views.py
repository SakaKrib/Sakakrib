from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.listings.models import Listing
from apps.core.domain_property import PropertyUnit, RenterUnitAssociation
from apps.core.domain_rent import RentInvoice

from .models import RealEstatePMSListingAssignment, RealEstatePMSMember, RealEstateSubscription
from .services import get_real_estate_pms_context, get_subscription_plan


def _context(user):
    context = get_real_estate_pms_context(user)
    if not context:
        return None
    return context


def _member_can_manage_listing(user, listing, *, require_assignment=False):
    context = _context(user)
    if not context or str(listing.user_id) != str(context['owner_id']):
        return None
    role = context.get('pms_role')
    if role in ('ADMIN', 'TEAM_MANAGER'):
        return context
    if role == 'AGENT':
        assigned = RealEstatePMSListingAssignment.objects.filter(
            real_estate_id=context['owner_id'],
            listing_id=listing.id,
            agent_id=user.id,
            is_active=True,
        ).exists()
        if assigned:
            return context
        if not require_assignment:
            return context
    return None


def _payload(unit):
    association = RenterUnitAssociation.objects.filter(
        unit_id=unit.id, status__iexact='ACTIVE'
    ).order_by('-created_at').first()
    listing = Listing.objects.filter(pk=unit.listing_id).first()
    return {
        'unit_id': str(unit.id),
        'listing_id': str(unit.listing_id),
        'listing_title': listing.title if listing else '',
        'unit_number': unit.unit_number,
        'unit_type': unit.unit_type,
        'rent': float(Decimal(unit.rent)),
        'deposit_amount': float(Decimal(unit.deposit_amount)),
        'size': unit.size,
        'beds': unit.beds,
        'baths': unit.baths,
        'availability': unit.availability,
        'description': unit.description,
        'position': unit.position,
        'payment_tracking_enabled': bool(unit.payment_tracking_enabled),
        'rent_due_day': unit.rent_due_day,
        'rent_paid_in_advance': bool(unit.rent_paid_in_advance),
        'rent_paid_through_month': unit.rent_paid_through_month.isoformat() if unit.rent_paid_through_month else None,
        'renter_name': association.renter_name if association else None,
        'renter_assoc_id': str(association.id) if association else None,
        'renter_user_id': str(association.renter_user_id) if association and association.renter_user_id else None,
        'renter_phone': association.renter_phone if association else None,
        'renter_email': association.renter_email if association else None,
        'lease_start': association.lease_start if association else None,
        'lease_end': association.lease_end if association else None,
    }


class RealEstatePMSUnitView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, unit_id=None):
        context = _context(request.user)
        if not context:
            return Response({'detail': 'Real-estate PMS access is required.'}, status=403)
        owner_id = context['owner_id']
        qs = PropertyUnit.objects.filter(listing__user_id=owner_id)
        if context.get('pms_role') == 'AGENT':
            qs = qs.filter(
                listing_id__in=RealEstatePMSListingAssignment.objects.filter(
                    real_estate_id=owner_id, agent_id=request.user.id, is_active=True
                ).values('listing_id')
            )
        if unit_id:
            unit = qs.filter(pk=unit_id).first()
            if not unit:
                return Response({'detail': 'Unit not found.'}, status=404)
            return Response(_payload(unit))
        return Response([_payload(unit) for unit in qs.order_by('position', 'created_at')])

    @transaction.atomic
    def post(self, request):
        context = _context(request.user)
        if not context or context.get('read_only'):
            return Response({'detail': 'An active real-estate PMS subscription is required for unit changes.'}, status=403)

        listing = Listing.objects.filter(
            pk=request.data.get('listing_id'),
            user_id=context['owner_id'],
            is_property_management=True,
            is_approved=True,
        ).first()
        if not listing:
            return Response({'detail': 'An approved property-management listing in this PMS is required.'}, status=400)
        if not _member_can_manage_listing(request.user, listing, require_assignment=True):
            return Response({'detail': 'You may only add units to listings you are authorized to manage.'}, status=403)

        subscription = context['subscription']
        plan = get_subscription_plan(subscription)
        if not subscription or subscription.status not in ('ACTIVE', 'GRACE_PERIOD'):
            return Response({'detail': 'An active real-estate PMS subscription is required.'}, status=403)
        if subscription.status == 'GRACE_PERIOD':
            return Response({'detail': 'PMS is read-only during the subscription grace period.'}, status=403)

        if plan and plan.max_units_per_listing is not None and PropertyUnit.objects.filter(
            listing_id=listing.id, user_id=context['owner_id']
        ).count() >= plan.max_units_per_listing:
            return Response({'detail': 'This listing has reached the unit capacity for the active subscription plan.'}, status=400)

        unit_number = str(request.data.get('unit_number') or '').strip()
        if not unit_number:
            return Response({'detail': 'Unit number is required.'}, status=400)
        try:
            rent = Decimal(str(request.data.get('rent') or '0'))
            deposit_amount = Decimal(str(request.data.get('deposit_amount') or '0'))
            beds = int(request.data.get('beds') or 1)
            baths = int(request.data.get('baths') or 1)
            position = int(request.data.get('position') or 0)
            rent_due_day = int(request.data.get('rent_due_day') or 1)
        except (InvalidOperation, TypeError, ValueError):
            return Response({'detail': 'Unit numeric fields are invalid.'}, status=400)
        if rent <= 0 or deposit_amount < 0 or beds < 0 or baths < 0 or position < 0:
            return Response({'detail': 'Unit numeric values are invalid.'}, status=400)
        if rent_due_day not in range(1, 32):
            return Response({'detail': 'Rent due day must be between 1 and 31.'}, status=400)

        unit = PropertyUnit.objects.create(
            listing_id=listing.id,
            user_id=context['owner_id'],
            unit_number=unit_number,
            unit_type=str(request.data.get('unit_type') or 'unit').strip(),
            rent=rent,
            deposit_amount=deposit_amount,
            size=request.data.get('size'),
            beds=beds,
            baths=baths,
            availability=str(request.data.get('availability') or 'available').strip(),
            description=request.data.get('description'),
            position=position,
            payment_tracking_enabled=bool(request.data.get('payment_tracking_enabled', True)),
            rent_due_day=rent_due_day,
        )
        return Response(_payload(unit), status=201)

    @transaction.atomic
    def patch(self, request, unit_id):
        context = _context(request.user)
        if not context or context.get('read_only'):
            return Response({'detail': 'An active real-estate PMS subscription is required for unit changes.'}, status=403)
        unit = PropertyUnit.objects.select_for_update().filter(pk=unit_id, listing__user_id=context['owner_id']).first()
        if not unit:
            return Response({'detail': 'Unit not found.'}, status=404)
        listing = Listing.objects.filter(pk=unit.listing_id).first()
        if not listing or not _member_can_manage_listing(request.user, listing, require_assignment=True):
            return Response({'detail': 'You may only edit units on listings you are authorized to manage.'}, status=403)
        try:
            for field in ('unit_number', 'unit_type', 'size', 'availability', 'description'):
                if field in request.data:
                    setattr(unit, field, request.data[field])
            if 'rent' in request.data:
                unit.rent = Decimal(str(request.data['rent']))
            if 'deposit_amount' in request.data:
                unit.deposit_amount = Decimal(str(request.data['deposit_amount']))
            if 'beds' in request.data:
                unit.beds = int(request.data['beds'])
            if 'baths' in request.data:
                unit.baths = int(request.data['baths'])
            if 'position' in request.data:
                unit.position = int(request.data['position'])
            if 'rent_due_day' in request.data:
                unit.rent_due_day = int(request.data['rent_due_day'])
        except (InvalidOperation, TypeError, ValueError):
            return Response({'detail': 'Unit numeric fields are invalid.'}, status=400)
        if not str(unit.unit_number or '').strip() or unit.rent is None or unit.rent <= 0 or unit.deposit_amount is None or unit.deposit_amount < 0:
            return Response({'detail': 'Unit values are invalid.'}, status=400)
        if unit.beds < 0 or unit.baths < 0 or unit.position < 0 or unit.rent_due_day not in range(1, 32):
            return Response({'detail': 'Unit numeric values are invalid.'}, status=400)
        if 'payment_tracking_enabled' in request.data:
            raw = request.data['payment_tracking_enabled']
            if isinstance(raw, bool):
                unit.payment_tracking_enabled = raw
            elif str(raw).strip().lower() in {'true', '1', 'yes', 'on'}:
                unit.payment_tracking_enabled = True
            elif str(raw).strip().lower() in {'false', '0', 'no', 'off'}:
                unit.payment_tracking_enabled = False
            else:
                return Response({'detail': 'payment_tracking_enabled must be a boolean.'}, status=400)
        unit.updated_at = timezone.now()
        unit.save()
        return Response(_payload(unit))

    @transaction.atomic
    def delete(self, request, unit_id):
        context = _context(request.user)
        if not context or context.get('read_only'):
            return Response({'detail': 'An active real-estate PMS subscription is required for unit changes.'}, status=403)
        if context.get('pms_role') != 'ADMIN':
            return Response({'detail': 'Only the PMS administrator can delete units.'}, status=403)
        unit = PropertyUnit.objects.select_for_update().filter(pk=unit_id, listing__user_id=context['owner_id']).first()
        if not unit:
            return Response({'detail': 'Unit not found.'}, status=404)
        if RenterUnitAssociation.objects.filter(unit_id=unit.id, status='ACTIVE').exists():
            return Response({'detail': 'This unit has an active renter and cannot be deleted.'}, status=409)
        if RentInvoice.objects.filter(unit_id=unit.id).exists():
            return Response({'detail': 'This unit has rent invoice history and cannot be permanently deleted.'}, status=409)
        RenterUnitAssociation.objects.filter(unit_id=unit.id).delete()
        unit.delete()
        return Response({'success': True})
