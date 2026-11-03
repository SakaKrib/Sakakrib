from django.test import SimpleTestCase

from .push_notifications import notification_deep_link


class NotificationDeepLinkTests(SimpleTestCase):
    def test_listing_notification_opens_the_listing(self):
        self.assertEqual(
            notification_deep_link('LISTING_APPROVED', {'listing_id': 'listing-123'}, 'landlord'),
            'listing-detail/listing-123',
        )

    def test_moving_started_notification_opens_live_map(self):
        self.assertEqual(
            notification_deep_link('MOVING_STARTED', {'booking_id': 'booking-123'}, 'renter'),
            'live-mover-map/booking-123',
        )

    def test_renter_chat_notification_uses_mover_profile_id(self):
        self.assertEqual(
            notification_deep_link(
                'NEW_CHAT_MESSAGE',
                {'mover_id': 'mover-profile-123', 'sender_id': 'mover-user-456'},
                'renter',
            ),
            'chat/mover-profile-123',
        )

    def test_mover_chat_notification_uses_renter_user_id(self):
        self.assertEqual(
            notification_deep_link(
                'NEW_CHAT_MESSAGE',
                {'renter_user_id': 'renter-123'},
                'mover',
            ),
            'mover-messages/renter-123',
        )

    def test_unrecognized_or_external_route_falls_back_to_notifications(self):
        self.assertEqual(
            notification_deep_link(
                'GENERAL',
                {'deep_link': 'https://malicious.example/path'},
                'renter',
            ),
            'renter-notifications',
        )

    def test_explicit_internal_route_is_preserved(self):
        self.assertEqual(
            notification_deep_link(
                'ANYTHING',
                {'deep_link': '#live-mover-map/booking-123'},
                'renter',
            ),
            'live-mover-map/booking-123',
        )
