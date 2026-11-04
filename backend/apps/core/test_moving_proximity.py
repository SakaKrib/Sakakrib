from types import SimpleNamespace
from unittest import TestCase

from .moving_proximity import (
    APPROACHING_METERS,
    ARRIVED_METERS,
    build_alerts,
    distance_meters,
    next_stop,
    proximity_stage,
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
