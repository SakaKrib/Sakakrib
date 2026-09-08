from django.utils import timezone


TRACKING_HEALTHY_AFTER_SECONDS = 30
TRACKING_STALE_AFTER_SECONDS = 120
MIN_LIVE_TELEMETRY_POINTS = 2


def tracking_health(recorded_at, *, recent_point_count=0, now=None):
    if recorded_at is None:
        return {"status": "OFFLINE", "is_live": False, "age_seconds": None, "recent_point_count": recent_point_count}
    now = now or timezone.now()
    age_seconds = max(0, int((now - recorded_at).total_seconds()))
    if age_seconds <= TRACKING_HEALTHY_AFTER_SECONDS:
        if recent_point_count >= MIN_LIVE_TELEMETRY_POINTS:
            status = "HEALTHY"
            is_live = True
        else:
            status = "STARTING"
            is_live = False
    elif age_seconds <= TRACKING_STALE_AFTER_SECONDS:
        status = "STALE"
        is_live = False
    else:
        status = "OFFLINE"
        is_live = False
    return {"status": status, "is_live": is_live, "age_seconds": age_seconds, "recent_point_count": recent_point_count}
