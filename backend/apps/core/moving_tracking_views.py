from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .chat_services import conversation_id_for_users
from .domain_bookings import Booking, BookingEvent, ChatMessage, MovingTrackingPoint
from .domain_journeys import JOURNEY_START_SOURCE_CHROME, JOURNEY_START_SOURCE_MOBILE_APP, MovingJourney
from .domain_platform import Mover, UserNotification
from .domain_property import Review
from .moving_tracking_consumers import tracking_group_name
from .notification_services import dispatch_user_notification

TRACKING_HEALTHY_AFTER_SECONDS = 30
TRACKING_STALE_AFTER_SECONDS = 120


def _serialize_point(point):
    if point is None:
        return None
    return {"id": point.id, "booking_id": str(point.booking_id), "mover_id": str(point.mover_id), "latitude": point.latitude, "longitude": point.longitude, "accuracy_meters": point.accuracy_meters, "speed_kph": point.speed_kph, "heading_degrees": point.heading_degrees, "recorded_at": point.recorded_at.isoformat()}


def _tracking_health(recorded_at, *, now=None):
    if recorded_at is None:
        return {"status": "OFFLINE", "is_live": False, "age_seconds": None}
    now = now or timezone.now()
    age_seconds = max(0, int((now - recorded_at).total_seconds()))
    if age_seconds <= TRACKING_HEALTHY_AFTER_SECONDS:
        status = "HEALTHY"
        is_live = True
    elif age_seconds <= TRACKING_STALE_AFTER_SECONDS:
        status = "STALE"
        is_live = False
    else:
        status = "OFFLINE"
        is_live = False
    return {"status": status, "is_live": is_live, "age_seconds": age_seconds}


def _participant_booking(user, booking_id):
    mover_ids = Mover.objects.filter(user_id=user.id).values("id")
    return Booking.objects.filter(id=booking_id).filter(renter_id=user.id).first() or Booking.objects.filter(id=booking_id, mover_id__in=mover_ids).first()


def _broadcast_location(point):
    layer = get_channel_layer()
    if not layer:
        return
    location = _serialize_point(point)
    group_name = tracking_group_name(point.booking_id)
    transaction.on_commit(lambda: async_to_sync(layer.group_send)(group_name, {"type": "moving.location", "location": location}))


def _tracking_number():
    import secrets
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "SK-MOV-%s-%s" % (timezone.now().strftime("%Y%m%d"), "".join(secrets.choice(alphabet) for _ in range(6)))


@transaction.atomic
def start_moving_journey(*, mover_user_id, booking_id, source=JOURNEY_START_SOURCE_MOBILE_APP):
    source = str(source or JOURNEY_START_SOURCE_MOBILE_APP).strip().upper()
    if source not in {JOURNEY_START_SOURCE_MOBILE_APP, JOURNEY_START_SOURCE_CHROME}:
        raise ValidationError("Invalid journey start source")

    booking = Booking.objects.select_for_update().filter(pk=booking_id).first()
    if booking is None:
        raise ValidationError("Booking not found")
    mover = Mover.objects.filter(pk=booking.mover_id, user_id=mover_user_id).first()
    if mover is None:
        raise ValidationError("Only the assigned mover can start the journey")
    if booking.payment_status != "paid":
        raise ValidationError("Booking must be paid before starting")
    if booking.status == "cancelled":
        raise ValidationError("Cancelled booking cannot start a journey")
    if booking.status != "confirmed":
        existing = MovingJourney.objects.filter(booking_id=booking.id).first()
        if existing and existing.status in {MovingJourney.STATUS_ACTIVE, MovingJourney.STATUS_DELIVERY_PENDING, MovingJourney.STATUS_COMPLETED}:
            return {"booking_id": str(booking.id), "journey_id": str(existing.id), "tracking_number": existing.tracking_number, "started_at": existing.started_at, "status": "already_started", "source": existing.start_source}
        raise ValidationError("Booking must be confirmed before starting")
    if booking.scheduled_start_at is None:
        raise ValidationError("Moving time must be scheduled")
    if booking.scheduled_end_at is not None and booking.scheduled_end_at <= booking.scheduled_start_at:
        raise ValidationError("Invalid scheduled time")

    existing = MovingJourney.objects.select_for_update().filter(booking_id=booking.id).first()
    if existing and existing.status in {MovingJourney.STATUS_ACTIVE, MovingJourney.STATUS_DELIVERY_PENDING, MovingJourney.STATUS_COMPLETED}:
        return {"booking_id": str(booking.id), "journey_id": str(existing.id), "tracking_number": existing.tracking_number, "started_at": existing.started_at, "status": "already_started", "source": existing.start_source}
    if booking.started_at is not None:
        if booking.tracking_number:
            raise ValidationError("Journey record is missing for an already-started booking")
        raise ValidationError("Booking has already started")

    now = timezone.now()
    tracking_number = _tracking_number()
    while MovingJourney.objects.filter(tracking_number=tracking_number).exists():
        tracking_number = _tracking_number()

    journey = MovingJourney.objects.create(booking_id=booking.id, mover_id=mover.id, tracking_number=tracking_number, status=MovingJourney.STATUS_ACTIVE, started_at=now, started_by=mover_user_id, start_source=source)
    booking.tracking_number = tracking_number
    booking.started_at = now
    booking.status = "in_progress"
    booking.updated_at = now
    booking.save(update_fields=["tracking_number", "started_at", "status", "updated_at"])

    BookingEvent.objects.create(
        conversation_id=str(booking.id), renter_id=booking.renter_id, mover_id=mover_user_id, mover_profile_id=mover.id,
        relocation_date=booking.moving_date, day_of_week=booking.moving_date.strftime("%A").strip(), pickup_time=booking.scheduled_start_at.time(),
        pickup_address=booking.pickup_address, dropoff_address=booking.dropoff_address, negotiated_price=booking.booking_amount,
        commission_amount=booking.commission_amount, total_amount=booking.total_amount, status="moving_started",
        payment_method=booking.payment_method or "", confirmed_at=booking.confirmed_at, paid_at=now, distance_km=booking.distance_km,
        rate_per_km_kes=booking.rate_per_km_kes, base_rate_kes=booking.base_rate_kes,
    )

    event_data = {"booking_id": str(booking.id), "journey_id": str(journey.id), "tracking_number": tracking_number, "start_source": source, "started_at": now.isoformat()}
    dispatch_user_notification(
        user_id=booking.renter_id, notification_type="MOVING_STARTED", title="Your move has started",
        message=f"Your mover has started the journey. Your tracking number is {tracking_number}.", data=event_data,
        event_key=f"moving-started:renter:{booking.id}", send_email=True, email_template="moving_started",
    )
    dispatch_user_notification(
        user_id=mover_user_id, notification_type="MOVING_STARTED", title="Journey started",
        message="The moving journey is now active.", data=event_data, event_key=f"moving-started:mover:{booking.id}", send_email=False,
    )
    conversation_id = conversation_id_for_users(booking.renter_id, mover_user_id)
    ChatMessage.objects.create(
        conversation_id=conversation_id, sender_id=mover_user_id, receiver_id=booking.renter_id,
        content=f"Your mover has started the journey. Tracking number: {tracking_number}.", message_type="system",
        event_data={"event_key": f"moving-started:chat:{booking.id}", **event_data},
    )
    return {"booking_id": str(booking.id), "journey_id": str(journey.id), "tracking_number": tracking_number, "started_at": now, "status": "started", "source": source}


@transaction.atomic
def record_mover_location(*, mover_user_id, booking_id, latitude, longitude, accuracy_meters=None, speed_kph=None, heading_degrees=None):
    try:
        latitude = float(latitude); longitude = float(longitude); accuracy_meters = None if accuracy_meters is None else float(accuracy_meters); speed_kph = None if speed_kph is None else float(speed_kph); heading_degrees = None if heading_degrees is None else float(heading_degrees)
    except (TypeError, ValueError) as exc:
        raise ValidationError("Invalid tracking coordinates or telemetry") from exc
    if not -90 <= latitude <= 90 or not -180 <= longitude <= 180: raise ValidationError("Invalid coordinates")
    if accuracy_meters is not None and not 0 <= accuracy_meters <= 10000: raise ValidationError("Invalid accuracy")
    if speed_kph is not None and not 0 <= speed_kph <= 300: raise ValidationError("Invalid speed")
    if heading_degrees is not None and not 0 <= heading_degrees < 360: raise ValidationError("Invalid heading")
    booking = Booking.objects.select_for_update().filter(pk=booking_id).first()
    mover = Mover.objects.filter(pk=booking.mover_id, user_id=mover_user_id).first() if booking else None
    if booking is None or mover is None: raise ValidationError("Booking not found or unauthorized")
    journey = MovingJourney.objects.select_for_update().filter(booking_id=booking.id).first()
    if journey is None or journey.mover_id != mover.id: raise ValidationError("Active moving journey not found")
    if journey.status != MovingJourney.STATUS_ACTIVE: raise ValidationError("Journey is not active")
    if booking.status != "in_progress" or booking.started_at is None or booking.completed_at is not None: raise ValidationError("Journey is not active")
    if booking.payment_status != "paid": raise ValidationError("Payment required before tracking")
    now = timezone.now()
    last = MovingTrackingPoint.objects.filter(booking_id=booking.id).order_by("-recorded_at").first()
    if last is not None and last.recorded_at > now - timezone.timedelta(seconds=5): return {"accepted": False, "throttled": True, "booking_id": str(booking.id), "recorded_at": last.recorded_at}
    point = MovingTrackingPoint.objects.create(booking_id=booking.id, mover_id=mover.id, latitude=latitude, longitude=longitude, accuracy_meters=accuracy_meters, speed_kph=speed_kph, heading_degrees=heading_degrees)
    mover.current_latitude = latitude; mover.current_longitude = longitude; mover.location_updated_at = now; mover.updated_at = now
    mover.save(update_fields=["current_latitude", "current_longitude", "location_updated_at", "updated_at"])
    booking.last_known_latitude = latitude; booking.last_known_longitude = longitude; booking.last_location_at = now; booking.updated_at = now
    booking.save(update_fields=["last_known_latitude", "last_known_longitude", "last_location_at", "updated_at"])
    _broadcast_location(point)
    return {"accepted": True, "throttled": False, "booking_id": str(booking.id), "latitude": latitude, "longitude": longitude, "recorded_at": point.recorded_at}


class MovingJourneyStartView(APIView):
    permission_classes = [IsAuthenticated]
    def post(self, request, booking_id):
        try:
            source = request.data.get("source") or request.headers.get("X-Saka-Tracking-Source") or JOURNEY_START_SOURCE_MOBILE_APP
            return Response(start_moving_journey(mover_user_id=request.user.id, booking_id=booking_id, source=source))
        except (ValidationError, TypeError, ValueError) as exc:
            return Response({"detail": str(exc)}, status=400)


class MovingTrackingView(APIView):
    permission_classes = [IsAuthenticated]
    def get(self, request, booking_id):
        booking = _participant_booking(request.user, booking_id)
        if booking is None: return Response({"detail": "Booking not found or unauthorized."}, status=404)
        mover = Mover.objects.filter(pk=booking.mover_id).first(); points = MovingTrackingPoint.objects.filter(booking_id=booking.id).order_by("-recorded_at")[:50]
        now = timezone.now()
        return Response({"booking": {"id": str(booking.id), "status": booking.status, "tracking_number": booking.tracking_number, "started_at": booking.started_at, "completed_at": booking.completed_at, "last_known_latitude": booking.last_known_latitude, "last_known_longitude": booking.last_known_longitude, "last_location_at": booking.last_location_at, "tracking_health": _tracking_health(booking.last_location_at, now=now)}, "mover": {"id": str(mover.id), "user_id": str(mover.user_id), "driver_full_name": mover.driver_full_name, "phone": mover.phone, "profile_photo_url": mover.profile_photo_url, "vehicle_type": mover.vehicle_type, "number_plate": mover.number_plate, "operating_city": mover.operating_city, "operating_county": mover.operating_county, "is_available": mover.is_available, "current_latitude": mover.current_latitude, "current_longitude": mover.current_longitude, "location_updated_at": mover.location_updated_at, "approval_status": mover.approval_status, "tracking_health": _tracking_health(mover.location_updated_at, now=now)} if mover else None, "tracking_points": [_serialize_point(point) for point in points]})
    def post(self, request, booking_id):
        try:
            return Response(record_mover_location(mover_user_id=request.user.id, booking_id=booking_id, latitude=request.data.get("latitude"), longitude=request.data.get("longitude"), accuracy_meters=request.data.get("accuracy_meters"), speed_kph=request.data.get("speed_kph"), heading_degrees=request.data.get("heading_degrees")))
        except (ValidationError, TypeError, ValueError) as exc: return Response({"detail": str(exc)}, status=400)


class ActiveMovingLocationView(APIView):
    permission_classes = [IsAuthenticated]
    def get(self, request, booking_id):
        booking = _participant_booking(request.user, booking_id)
        if booking is None or booking.status != "in_progress": return Response({"detail": "Active moving journey not found."}, status=404)
        point = MovingTrackingPoint.objects.filter(booking_id=booking.id).order_by("-recorded_at").first()
        now = timezone.now()
        return Response({"location": _serialize_point(point), "tracking_health": _tracking_health(point.recorded_at if point else None, now=now)})


class MoverReviewAfterDeliveryView(APIView):
    permission_classes = [IsAuthenticated]
    @transaction.atomic
    def post(self, request, booking_id):
        booking = Booking.objects.select_for_update().filter(pk=booking_id, renter_id=request.user.id).first()
        if booking is None: return Response({"detail": "Booking not found or unauthorized."}, status=404)
        if booking.status != "completed" or booking.renter_confirmed_delivery_at is None: return Response({"detail": "Delivery must be confirmed first."}, status=400)
        try: rating = int(request.data.get("rating"))
        except (TypeError, ValueError): return Response({"detail": "Rating must be an integer."}, status=400)
        if not 1 <= rating <= 5: return Response({"detail": "Rating must be between 1 and 5."}, status=400)
        if Review.objects.filter(booking_id=booking.id).exists(): return Response({"detail": "This booking has already been reviewed."}, status=409)
        mover = Mover.objects.filter(pk=booking.mover_id).first()
        if mover is None: return Response({"detail": "Mover not found."}, status=404)
        review = Review.objects.create(reviewer_id=request.user.id, reviewee_id=mover.user_id, mover_id=mover.id, rating=rating, comment=str(request.data.get("comment") or ""), review_type="mover", booking_id=booking.id)
        UserNotification.objects.create(user_id=mover.user_id, notification_type="MOVER_REVIEW_RECEIVED", title="You received a mover review", message="A renter has rated your moving service.", data={"booking_id": str(booking.id), "review_id": str(review.id), "rating": rating})
        return Response({"review_id": str(review.id), "booking_id": str(booking.id), "rating": rating}, status=201)
