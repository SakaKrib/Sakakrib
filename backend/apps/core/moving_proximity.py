"""Arrival alerts for a moving journey.

Every GPS point the mover's phone reports goes through record_mover_location(). After saving
the point, that function calls notify_journey_proximity(), which decides whether the mover has
just come close to, or reached, the next stop and, if so, creates a notification. A saved
notification is pushed to the user's phone through Firebase (see push_notifications.py and the
post_save receiver in realtime_signals.py), so it arrives even when the app is closed.

Stops, in order:
  Point A  the pickup address      (phase HEADING_TO_PICKUP)
  Point B  the drop-off address    (phase IN_TRANSIT)

Each alert fires once per booking: the notification event_key is unique per booking, stop and
stage, and dispatch_user_notification() ignores a key it has already stored.
"""
import logging
import math
from datetime import datetime, timedelta, timezone as dt_timezone

logger = logging.getLogger(__name__)

PHASE_HEADING_TO_PICKUP = "HEADING_TO_PICKUP"
PHASE_IN_TRANSIT = "IN_TRANSIT"

# "Nearby" alert: the mover is this close to the next stop.
APPROACHING_METERS = 1000
# "Arrived" alert: the mover is at the stop.
ARRIVED_METERS = 150
# A GPS fix less accurate than this cannot prove the mover has arrived.
MAX_ARRIVAL_ACCURACY_METERS = 100

# ---- Journey rules (each can be overridden in Django settings) ----------------------------------
# The mover may start the journey this many minutes before the scheduled start time.
DEFAULT_EARLY_START_MINUTES = 30
# Pickup / delivery can only be confirmed with a GPS fix at least this fresh...
DEFAULT_LOCATION_MAX_AGE_SECONDS = 180
# ...and this close to the stop. Pickup is generous because renters pin approximate addresses;
# delivery is tighter because it ends the journey.
DEFAULT_PICKUP_RADIUS_METERS = 500
DEFAULT_DELIVERY_RADIUS_METERS = 200


def _setting(name, default):
    """Django setting `name` as an int, or `default` (also when Django is not configured)."""
    try:
        from django.conf import settings
        value = getattr(settings, name, default)
        return max(0, int(value))
    except Exception:
        return default


def early_start_minutes():
    return _setting("MOVING_EARLY_START_MINUTES", DEFAULT_EARLY_START_MINUTES)


def location_max_age_seconds():
    return _setting("MOVING_LOCATION_MAX_AGE_SECONDS", DEFAULT_LOCATION_MAX_AGE_SECONDS)


def pickup_radius_meters():
    return _setting("MOVING_PICKUP_RADIUS_METERS", DEFAULT_PICKUP_RADIUS_METERS)


def delivery_radius_meters():
    return _setting("MOVING_DELIVERY_RADIUS_METERS", DEFAULT_DELIVERY_RADIUS_METERS)


def journey_rules():
    """The thresholds the apps need to mirror these rules in the UI."""
    return {
        "early_start_minutes": early_start_minutes(),
        "location_max_age_seconds": location_max_age_seconds(),
        "pickup_radius_meters": pickup_radius_meters(),
        "delivery_radius_meters": delivery_radius_meters(),
    }


def distance_meters(lat1, lon1, lat2, lon2):
    """Great-circle distance between two coordinates in metres (haversine)."""
    radius = 6371000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return 2 * radius * math.asin(math.sqrt(a))


def format_distance(meters):
    """'1.4 km' or '320 m'."""
    meters = max(0.0, float(meters))
    if meters >= 1000:
        return f"{meters / 1000:.1f} km"
    return f"{int(round(meters))} m"


def format_local_datetime(value):
    """'Thu 05 Nov 2026, 14:30' in the project's local time zone."""
    try:
        from django.utils import timezone as dj_timezone
        local = dj_timezone.localtime(value) if dj_timezone.is_aware(value) else value
    except Exception:
        local = value
    return local.strftime("%a %d %b %Y, %H:%M")


def start_window(scheduled_start_at, *, now=None, early_minutes=None):
    """When the mover may start: {'can_start_at', 'server_now', 'can_start'}.

    The window opens `early_minutes` before the scheduled start and stays open afterwards (a
    mover who is running late must still be able to start). No schedule means it cannot open.
    """
    now = now or datetime.now(dt_timezone.utc)
    if scheduled_start_at is None:
        return {"can_start_at": None, "server_now": now, "can_start": False}
    early = early_start_minutes() if early_minutes is None else early_minutes
    opens_at = scheduled_start_at - timedelta(minutes=early)
    compare_now = now if scheduled_start_at.tzinfo is not None else now.replace(tzinfo=None)
    return {"can_start_at": opens_at, "server_now": now, "can_start": compare_now >= opens_at}


def evaluate_stop_proximity(*, last_latitude, last_longitude, last_at, target_latitude, target_longitude,
                            radius_meters, label, now=None, max_age_seconds=None):
    """Has the mover's latest GPS fix reached a stop?

    Returns {'ok', 'reason', 'distance', 'message'}. `reason` is one of 'no_target_coordinates'
    (cannot be verified, so allowed), 'no_location', 'stale', 'too_far' or 'at_stop'. `message`
    is a sentence that can be shown to the mover as it is.
    """
    if target_latitude is None or target_longitude is None:
        return {"ok": True, "reason": "no_target_coordinates", "distance": None, "message": ""}

    if last_latitude is None or last_longitude is None or last_at is None:
        return {"ok": False, "reason": "no_location", "distance": None,
                "message": f"We have no GPS location from you yet, so we cannot confirm you are at the {label}. Keep the app open with Location on, then try again."}

    now = now or datetime.now(dt_timezone.utc)
    if last_at.tzinfo is None:
        now = now.replace(tzinfo=None)
    max_age = location_max_age_seconds() if max_age_seconds is None else max_age_seconds
    age = (now - last_at).total_seconds()
    if age > max_age:
        minutes = max(1, int(round(age / 60)))
        return {"ok": False, "reason": "stale", "distance": None,
                "message": f"Your last GPS update was about {minutes} min ago. Keep the app open with Location on so we can confirm you are at the {label}, then try again."}

    distance = distance_meters(float(last_latitude), float(last_longitude), float(target_latitude), float(target_longitude))
    if distance > radius_meters:
        return {"ok": False, "reason": "too_far", "distance": distance,
                "message": f"You are {format_distance(distance)} from the {label}. Get within {format_distance(radius_meters)} to continue."}
    return {"ok": True, "reason": "at_stop", "distance": distance, "message": ""}


def next_stop(booking, phase):
    """(stop key, label, latitude, longitude) the mover is heading for, or None."""
    if phase == PHASE_IN_TRANSIT:
        lat, lon, key, label = booking.dropoff_latitude, booking.dropoff_longitude, "dropoff", "destination (Point B)"
    else:
        lat, lon, key, label = booking.pickup_latitude, booking.pickup_longitude, "pickup", "pickup point (Point A)"
    if lat is None or lon is None:
        return None
    return key, label, float(lat), float(lon)


def proximity_stage(distance, accuracy_meters=None):
    """'arrived', 'approaching' or None for a distance to the next stop."""
    if distance <= ARRIVED_METERS and (accuracy_meters is None or accuracy_meters <= MAX_ARRIVAL_ACCURACY_METERS):
        return "arrived"
    if distance <= APPROACHING_METERS:
        return "approaching"
    return None


def _distance_text(distance):
    if distance >= 950:
        return f"about {distance / 1000:.1f} km"
    return f"about {int(round(distance, -1)) or 10} m"


def _mover_name(mover):
    return (
        str(getattr(mover, "business_name", "") or "").strip()
        or str(getattr(mover, "driver_full_name", "") or "").strip()
        or "Your mover"
    )


def build_alerts(*, booking, mover, phase, stage, distance):
    """List of alerts to send for this stage: dicts with recipient, key suffix, title and message."""
    stop = next_stop(booking, phase)
    if stop is None:
        return []
    key, label, _lat, _lon = stop
    name = _mover_name(mover)
    renter_data = {"booking_id": str(booking.id), "deep_link": f"live-mover-map/{booking.id}", "stop": key, "stage": stage}
    mover_data = {"booking_id": str(booking.id), "deep_link": f"mover-booking-detail/{booking.id}", "stop": key, "stage": stage}

    alerts = []
    if stage == "approaching":
        alerts.append({
            "user": booking.renter_id, "suffix": "renter",
            "type": f"MOVER_NEARING_{key.upper()}",
            "title": "Your mover is nearby",
            "message": f"{name} is {_distance_text(distance)} from the {label}.",
            "data": renter_data,
        })
    elif stage == "arrived" and key == "pickup":
        alerts.append({
            "user": booking.renter_id, "suffix": "renter",
            "type": "MOVER_ARRIVED_PICKUP",
            "title": "Your mover has arrived",
            "message": f"{name} has reached the {label}. Please be ready to load.",
            "data": renter_data,
        })
    elif stage == "arrived" and key == "dropoff":
        alerts.append({
            "user": booking.renter_id, "suffix": "renter",
            "type": "MOVER_ARRIVED_DROPOFF",
            "title": "Your belongings have arrived",
            "message": f"{name} has reached the {label}. Confirm delivery in the app once everything is unloaded.",
            "data": renter_data,
        })
        alerts.append({
            "user": mover.user_id, "suffix": "mover",
            "type": "MOVER_ARRIVED_DROPOFF",
            "title": "You have reached the destination",
            "message": "Unload with the renter, then confirm delivery in the app to complete the job.",
            "data": mover_data,
        })
    return alerts


def notify_journey_proximity(*, booking, mover, journey, latitude, longitude, accuracy_meters=None):
    """Create 'nearby' / 'arrived' notifications for the mover's current stop. Never raises."""
    try:
        phase = (getattr(journey, "phase", None) or PHASE_HEADING_TO_PICKUP)
        stop = next_stop(booking, phase)
        if stop is None:
            return []
        key, _label, stop_lat, stop_lon = stop
        distance = distance_meters(float(latitude), float(longitude), stop_lat, stop_lon)
        stage = proximity_stage(distance, accuracy_meters)
        if stage is None:
            return []

        # Imported here so the geometry above stays importable and testable without Django.
        from .notification_services import dispatch_user_notification

        sent = []
        for alert in build_alerts(booking=booking, mover=mover, phase=phase, stage=stage, distance=distance):
            dispatch_user_notification(
                user_id=alert["user"],
                notification_type=alert["type"],
                title=alert["title"],
                message=alert["message"],
                data=alert["data"],
                event_key=f"journey:{booking.id}:{key}:{stage}:{alert['suffix']}",
                send_email=False,
            )
            sent.append(alert["type"])
        return sent
    except Exception:  # an alert must never break location recording
        logger.exception("Journey proximity alert failed for booking %s", getattr(booking, "id", None))
        return []
