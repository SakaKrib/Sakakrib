from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .chat_services import conversation_id_for_users
from .domain_bookings import Booking, ChatMessage
from .domain_journeys import JOURNEY_PHASE_HEADING_TO_PICKUP, JOURNEY_PHASE_IN_TRANSIT, MovingJourney
from .domain_platform import Mover
from .moving_tracking_consumers import tracking_group_name
from .notification_services import dispatch_user_notification


def journey_phase(journey):
    if journey is None:
        return None
    return journey.phase or JOURNEY_PHASE_HEADING_TO_PICKUP


def _broadcast_phase(booking_id, phase, changed_at):
    layer = get_channel_layer()
    if not layer:
        return
    payload = {
        "type": "moving.phase",
        "booking_id": str(booking_id),
        "phase": phase,
        "changed_at": changed_at.isoformat(),
    }
    transaction.on_commit(
        lambda: async_to_sync(layer.group_send)(tracking_group_name(booking_id), payload)
    )


def get_journey_phase(*, user_id, booking_id):
    mover_ids = Mover.objects.filter(user_id=user_id).values("id")
    booking = (
        Booking.objects.filter(pk=booking_id, renter_id=user_id).first()
        or Booking.objects.filter(pk=booking_id, mover_id__in=mover_ids).first()
    )
    if booking is None:
        raise ValidationError("Booking not found or unauthorized")

    journey = MovingJourney.objects.filter(booking_id=booking.id).first()
    phase = journey_phase(journey)
    return {
        "booking_id": str(booking.id),
        "status": booking.status,
        "phase": phase,
        "pickup_confirmed_at": journey.pickup_confirmed_at if journey else None,
        "pickup_confirmed_by": str(journey.pickup_confirmed_by) if journey and journey.pickup_confirmed_by else None,
    }


@transaction.atomic
def confirm_mover_pickup(*, mover_user_id, booking_id):
    booking = Booking.objects.select_for_update().filter(pk=booking_id).first()
    if booking is None:
        raise ValidationError("Booking not found")

    mover = Mover.objects.filter(pk=booking.mover_id, user_id=mover_user_id).first()
    if mover is None:
        raise ValidationError("Only the assigned mover can confirm pickup")
    if booking.payment_status != "paid":
        raise ValidationError("Booking must be paid before pickup can be confirmed")
    if booking.status != "in_progress":
        raise ValidationError("The moving journey must be active before pickup can be confirmed")

    journey = MovingJourney.objects.select_for_update().filter(booking_id=booking.id).first()
    if journey is None or journey.mover_id != mover.id:
        raise ValidationError("Active moving journey not found")
    if journey.status != MovingJourney.STATUS_ACTIVE:
        raise ValidationError("Journey is not active")

    if journey.phase == JOURNEY_PHASE_IN_TRANSIT and journey.pickup_confirmed_at:
        return {
            "booking_id": str(booking.id),
            "journey_id": str(journey.id),
            "phase": journey.phase,
            "pickup_confirmed_at": journey.pickup_confirmed_at,
            "already_confirmed": True,
        }

    if journey.phase != JOURNEY_PHASE_HEADING_TO_PICKUP:
        raise ValidationError("Journey is not awaiting pickup confirmation")

    now = timezone.now()
    journey.phase = JOURNEY_PHASE_IN_TRANSIT
    journey.pickup_confirmed_at = now
    journey.pickup_confirmed_by = mover_user_id
    journey.updated_at = now
    journey.save(update_fields=["phase", "pickup_confirmed_at", "pickup_confirmed_by", "updated_at"])

    event_data = {
        "booking_id": str(booking.id),
        "journey_id": str(journey.id),
        "phase": journey.phase,
        "pickup_confirmed_at": now.isoformat(),
    }
    dispatch_user_notification(
        user_id=booking.renter_id,
        notification_type="MOVING_PICKUP_CONFIRMED",
        title="Your items have been picked up",
        message="The mover has confirmed pickup. Live tracking will now show the journey to the destination.",
        data=event_data,
        event_key=f"moving-pickup-confirmed:renter:{booking.id}",
        send_email=False,
    )
    conversation_id = conversation_id_for_users(booking.renter_id, mover_user_id)
    ChatMessage.objects.create(
        conversation_id=conversation_id,
        sender_id=mover_user_id,
        receiver_id=booking.renter_id,
        content="Pickup confirmed. The mover is now travelling to the destination.",
        message_type="system",
        event_data={"event_key": f"moving-pickup-confirmed:chat:{booking.id}", **event_data},
    )
    _broadcast_phase(booking.id, journey.phase, now)

    return {
        "booking_id": str(booking.id),
        "journey_id": str(journey.id),
        "phase": journey.phase,
        "pickup_confirmed_at": now,
        "already_confirmed": False,
    }


class MovingJourneyPhaseView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, booking_id):
        try:
            return Response(get_journey_phase(user_id=request.user.id, booking_id=booking_id))
        except (ValidationError, TypeError, ValueError) as exc:
            return Response({"detail": str(exc)}, status=404)

    def post(self, request, booking_id):
        try:
            return Response(confirm_mover_pickup(mover_user_id=request.user.id, booking_id=booking_id))
        except (ValidationError, TypeError, ValueError) as exc:
            return Response({"detail": str(exc)}, status=400)
