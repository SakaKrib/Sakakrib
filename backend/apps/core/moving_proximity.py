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

logger = logging.getLogger(__name__)

PHASE_HEADING_TO_PICKUP = "HEADING_TO_PICKUP"
PHASE_IN_TRANSIT = "IN_TRANSIT"

# "Nearby" alert: the mover is this close to the next stop.
APPROACHING_METERS = 1000
# "Arrived" alert: the mover is at the stop.
ARRIVED_METERS = 150
# A GPS fix less accurate than this cannot prove the mover has arrived.
MAX_ARRIVAL_ACCURACY_METERS = 100


def distance_meters(lat1, lon1, lat2, lon2):
    """Great-circle distance between two coordinates in metres (haversine)."""
    radius = 6371000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return 2 * radius * math.asin(math.sqrt(a))


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
