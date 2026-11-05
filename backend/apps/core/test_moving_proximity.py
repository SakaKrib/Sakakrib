from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest import TestCase

from .moving_proximity import (
    APPROACHING_METERS,
    ARRIVED_METERS,
    DEFAULT_DELIVERY_RADIUS_METERS,
    DEFAULT_EARLY_START_MINUTES,
    DEFAULT_LOCATION_MAX_AGE_SECONDS,
    DEFAULT_PICKUP_RADIUS_METERS,
    build_alerts,
    distance_meters,
    evaluate_stop_proximity,
    format_distance,
    journey_rules,
    next_stop,
    proximity_stage,
    start_window,
)


def booking():
    return SimpleNamespace(
        id="b1", renter_id="renter-1",
        pickup_latitude=-1.2864, pickup_longitude=36.8172,
        dropoff_latitude=-1.3000, dropoff_longitude=36.8300,
    )


class ProximityGeometryTests(TestCase):
    def test_distance_is_zero_for_same_point_and_about_111km_per_degree(self):
        self.assertAlmostEqual(distance_meters(0, 0, 0, 0), 0, places=3)
        self.assertAlmostEqual(distance_meters(0, 0, 1, 0), 111195, delta=200)

    def test_stage_thresholds(self):
        self.assertEqual(proximity_stage(ARRIVED_METERS - 1), "arrived")
        self.assertEqual(proximity_stage(ARRIVED_METERS + 1), "approaching")
        self.assertEqual(proximity_stage(APPROACHING_METERS + 1), None)

    def test_poor_gps_accuracy_cannot_claim_arrival(self):
        self.assertEqual(proximity_stage(50, accuracy_meters=400), "approaching")
        self.assertEqual(proximity_stage(50, accuracy_meters=20), "arrived")

    def test_next_stop_follows_the_journey_phase(self):
        self.assertEqual(next_stop(booking(), "HEADING_TO_PICKUP")[0], "pickup")
        self.assertEqual(next_stop(booking(), "IN_TRANSIT")[0], "dropoff")

    def test_no_stop_without_coordinates(self):
        b = booking()
        b.pickup_latitude = None
        self.assertIsNone(next_stop(b, "HEADING_TO_PICKUP"))


class ProximityAlertTests(TestCase):
    mover = SimpleNamespace(user_id="mover-user", business_name="", driver_full_name="Joseph")

    def test_arrival_at_pickup_notifies_only_the_renter(self):
        alerts = build_alerts(booking=booking(), mover=self.mover, phase="HEADING_TO_PICKUP", stage="arrived", distance=40)
        self.assertEqual([a["user"] for a in alerts], ["renter-1"])
        self.assertEqual(alerts[0]["type"], "MOVER_ARRIVED_PICKUP")
        self.assertEqual(alerts[0]["data"]["deep_link"], "live-mover-map/b1")

    def test_arrival_at_dropoff_notifies_renter_and_mover(self):
        alerts = build_alerts(booking=booking(), mover=self.mover, phase="IN_TRANSIT", stage="arrived", distance=40)
        self.assertEqual({a["user"] for a in alerts}, {"renter-1", "mover-user"})
        self.assertEqual({a["suffix"] for a in alerts}, {"renter", "mover"})

    def test_nearby_alert_includes_distance(self):
        alerts = build_alerts(booking=booking(), mover=self.mover, phase="HEADING_TO_PICKUP", stage="approaching", distance=640)
        self.assertIn("about 640 m", alerts[0]["message"])
        self.assertIn("Joseph", alerts[0]["message"])


NOW = datetime(2026, 11, 5, 9, 0, tzinfo=timezone.utc)
STOP = (-1.3000, 36.8300)


def fix(lat=None, lon=None, age_seconds=10):
    return dict(
        last_latitude=STOP[0] if lat is None else lat,
        last_longitude=STOP[1] if lon is None else lon,
        last_at=NOW - timedelta(seconds=age_seconds),
        target_latitude=STOP[0], target_longitude=STOP[1],
        radius_meters=DEFAULT_DELIVERY_RADIUS_METERS, label="destination", now=NOW,
    )


class StartWindowTests(TestCase):
    def test_defaults_match_the_documented_rules(self):
        rules = journey_rules()
        self.assertEqual(rules["early_start_minutes"], DEFAULT_EARLY_START_MINUTES)
        self.assertEqual(rules["pickup_radius_meters"], DEFAULT_PICKUP_RADIUS_METERS)
        self.assertEqual(rules["delivery_radius_meters"], DEFAULT_DELIVERY_RADIUS_METERS)
        self.assertEqual(rules["location_max_age_seconds"], DEFAULT_LOCATION_MAX_AGE_SECONDS)

    def test_cannot_start_before_the_window_opens(self):
        window = start_window(NOW + timedelta(hours=2), now=NOW, early_minutes=30)
        self.assertFalse(window["can_start"])
        self.assertEqual(window["can_start_at"], NOW + timedelta(hours=2) - timedelta(minutes=30))

    def test_can_start_from_the_early_minutes_and_stays_open_when_late(self):
        self.assertTrue(start_window(NOW + timedelta(minutes=30), now=NOW, early_minutes=30)["can_start"])
        self.assertFalse(start_window(NOW + timedelta(minutes=31), now=NOW, early_minutes=30)["can_start"])
        self.assertTrue(start_window(NOW - timedelta(hours=3), now=NOW, early_minutes=30)["can_start"])

    def test_no_schedule_means_no_start(self):
        window = start_window(None, now=NOW)
        self.assertFalse(window["can_start"])
        self.assertIsNone(window["can_start_at"])


class StopProximityTests(TestCase):
    def test_at_the_stop_is_ok(self):
        result = evaluate_stop_proximity(**fix())
        self.assertTrue(result["ok"])
        self.assertEqual(result["reason"], "at_stop")

    def test_too_far_reports_the_distance_in_km_and_the_radius(self):
        result = evaluate_stop_proximity(**fix(lat=-1.2864, lon=36.8172))
        self.assertFalse(result["ok"])
        self.assertEqual(result["reason"], "too_far")
        self.assertRegex(result["message"], r"You are \d+\.\d km from the destination")
        self.assertIn("200 m", result["message"])

    def test_close_but_outside_radius_reports_metres(self):
        # about 330 m north of the stop
        result = evaluate_stop_proximity(**fix(lat=STOP[0] + 0.003))
        self.assertFalse(result["ok"])
        self.assertRegex(result["message"], r"You are \d{3} m from the destination")

    def test_stale_fix_is_rejected(self):
        result = evaluate_stop_proximity(**fix(age_seconds=600))
        self.assertFalse(result["ok"])
        self.assertEqual(result["reason"], "stale")

    def test_missing_location_is_rejected(self):
        args = fix()
        args["last_at"] = None
        self.assertEqual(evaluate_stop_proximity(**args)["reason"], "no_location")

    def test_unknown_target_coordinates_cannot_be_verified_so_are_allowed(self):
        args = fix()
        args["target_latitude"] = None
        result = evaluate_stop_proximity(**args)
        self.assertTrue(result["ok"])
        self.assertEqual(result["reason"], "no_target_coordinates")

    def test_format_distance(self):
        self.assertEqual(format_distance(320.4), "320 m")
        self.assertEqual(format_distance(1449), "1.4 km")
