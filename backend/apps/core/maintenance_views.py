"""Maintenance requests: renters report problems, owners/agents triage and resolve them."""
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.listings.models import Listing

from .domain_property import MaintenanceRequest, PropertyUnit, RenterUnitAssociation
from .notification_services import dispatch_user_notification
from .rent_views import _pms_actor

CATEGORIES = {'plumbing', 'electrical', 'security', 'appliance', 'structure', 'pests', 'internet', 'other'}
PRIORITIES = {'low', 'normal', 'urgent'}
STATUSES = ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED')


def _row(item, unit=None, listing=None, renter_name=''):
    return {
        'id': str(item.id), 'unit_id': str(item.unit_id), 'listing_id': str(item.listing_id),
        'unit_number': unit.unit_number if unit else None, 'listing_title': listing.title if listing else '',
        'renter_name': renter_name, 'title': item.title, 'description': item.description,
        'category': item.category, 'priority': item.priority, 'status': item.status,
        'response_note': item.response_note, 'assigned_name': item.assigned_name,
        'assigned_phone': item.assigned_phone, 'created_at': item.created_at,
        'updated_at': item.updated_at, 'resolved_at': item.resolved_at,
    }


class RenterMaintenanceView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        rows = list(MaintenanceRequest.objects.filter(renter_user_id=request.user.pk)[:100])
        units = {u.id: u for u in PropertyUnit.objects.filter(id__in={r.unit_id for r in rows})}
        listings = {l.id: l for l in Listing.objects.filter(id__in={r.listing_id for r in rows})}
        return Response([_row(r, units.get(r.unit_id), listings.get(r.listing_id)) for r in rows])

    def post(self, request):
        assoc = RenterUnitAssociation.objects.filter(renter_user_id=request.user.pk, status='ACTIVE').order_by('-created_at').first()
        if assoc is None:
            return Response({'detail': 'You need an active rental to send a maintenance request.'}, status=403)
        title = str(request.data.get('title') or '').strip()
        if len(title) < 3:
            return Response({'detail': 'Describe the problem in a few words.'}, status=400)
        category = str(request.data.get('category') or 'other').lower()
        priority = str(request.data.get('priority') or 'normal').lower()
        if category not in CATEGORIES or priority not in PRIORITIES:
            return Response({'detail': 'Choose a valid category and priority.'}, status=400)
        if MaintenanceRequest.objects.filter(renter_user_id=request.user.pk, unit_id=assoc.unit_id, title__iexact=title, status__in=['OPEN', 'IN_PROGRESS']).exists():
            return Response({'detail': 'You already have an open request with this title.'}, status=400)
        unit = PropertyUnit.objects.filter(pk=assoc.unit_id).first()
        if unit is None:
            return Response({'detail': 'Your unit could not be found.'}, status=404)
        item = MaintenanceRequest.objects.create(
            owner_id=assoc.landlord_id, listing_id=unit.listing_id, unit_id=unit.id, renter_user_id=request.user.pk,
            title=title[:160], description=str(request.data.get('description') or '').strip()[:1500], category=category, priority=priority,
        )
        listing = Listing.objects.filter(pk=unit.listing_id).first()
        place = f"Unit {unit.unit_number}" + (f" at {listing.title}" if listing else '')
        dispatch_user_notification(
            user_id=assoc.landlord_id, notification_type='MAINTENANCE_REQUESTED',
            title='Urgent maintenance request' if priority == 'urgent' else 'New maintenance request',
            message=f"{assoc.renter_name or 'A renter'} reported: {item.title} ({place}).",
            data={'maintenance_id': str(item.id), 'unit_id': str(unit.id), 'listing_id': str(unit.listing_id), 'priority': priority},
            event_key=f'maintenance-requested:{item.id}',
        )
        return Response(_row(item, unit, listing), status=201)


class PMSMaintenanceView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        owner_id, denied = _pms_actor(request)
        if denied:
            return denied
        rows = list(MaintenanceRequest.objects.filter(owner_id=owner_id)[:200])
        units = {u.id: u for u in PropertyUnit.objects.filter(id__in={r.unit_id for r in rows})}
        listings = {l.id: l for l in Listing.objects.filter(id__in={r.listing_id for r in rows})}
        names = {a.renter_user_id: a.renter_name for a in RenterUnitAssociation.objects.filter(renter_user_id__in={r.renter_user_id for r in rows}, landlord_id=owner_id)}
        return Response([_row(r, units.get(r.unit_id), listings.get(r.listing_id), names.get(r.renter_user_id, '')) for r in rows])

    def patch(self, request, request_id):
        owner_id, denied = _pms_actor(request)
        if denied:
            return denied
        item = MaintenanceRequest.objects.filter(pk=request_id, owner_id=owner_id).first()
        if item is None:
            return Response({'detail': 'Maintenance request not found.'}, status=404)
        previous = item.status
        status_value = str(request.data.get('status') or item.status).upper()
        if status_value not in STATUSES:
            return Response({'detail': 'Invalid status.'}, status=400)
        item.status = status_value
        if 'response_note' in request.data:
            item.response_note = str(request.data.get('response_note') or '').strip()[:1000]
        if 'assigned_name' in request.data:
            item.assigned_name = str(request.data.get('assigned_name') or '').strip()[:120]
        if 'assigned_phone' in request.data:
            item.assigned_phone = str(request.data.get('assigned_phone') or '').strip()[:40]
        item.updated_at = timezone.now()
        item.resolved_at = item.updated_at if status_value in ('RESOLVED', 'CLOSED') else None
        item.save()
        if status_value != previous or request.data.get('response_note'):
            labels = {'OPEN': 'reopened', 'IN_PROGRESS': 'being worked on', 'RESOLVED': 'resolved', 'CLOSED': 'closed'}
            text = f'Your maintenance request "{item.title}" is {labels[status_value]}.'
            if item.assigned_name and status_value == 'IN_PROGRESS':
                text += f' {item.assigned_name}{" (" + item.assigned_phone + ")" if item.assigned_phone else ""} will attend to it.'
            if item.response_note:
                text += f' Note: {item.response_note}'
            dispatch_user_notification(
                user_id=item.renter_user_id, notification_type='MAINTENANCE_UPDATED', title='Maintenance request update', message=text,
                data={'maintenance_id': str(item.id), 'status': status_value},
                event_key=f'maintenance-updated:{item.id}:{status_value}:{int(item.updated_at.timestamp())}',
            )
        unit = PropertyUnit.objects.filter(pk=item.unit_id).first()
        listing = Listing.objects.filter(pk=item.listing_id).first()
        return Response(_row(item, unit, listing))
