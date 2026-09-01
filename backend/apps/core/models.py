"""Frozen Supabase schema mapped into Django models during migration.

Foreign-key relationships are intentionally represented as UUID fields for this
phase so the Django schema preserves the existing database contract exactly.
"""

from .domain_bookings import (
    Booking, BookingEvent, ChatMessage, MoverPayout, MoverScheduleEvent,
    MovingCancellationEvent, MovingDispute, MovingInvoice, MovingPayment,
    MovingTrackingPoint,
)
from .domain_platform import (
    MoverApplication, Mover, NotificationEmail, PaymentWebhookEvent,
    UserNotification, RenterNotification, SubscriptionRenewalAttempt,
    SupportTicket, TermsAcceptance,
)
from .domain_property import (
    LandlordPaymentMethod, PropertyUnit, RenterUnitAssociation, ListingMedia,
    ExchangeRateCache, PMSSubscriptionNotification, PlatformSettings,
    CommunityPost, Review,
)
from .domain_rent import (
    RentInvoicePeriod, RentInvoice, RentPaymentIntent,
    RentPaymentSubmission, RentPayment, RentReminderSetting, RentReminder,
)

__all__ = [
    'Booking', 'BookingEvent', 'ChatMessage', 'MoverPayout',
    'MoverScheduleEvent', 'MovingCancellationEvent', 'MovingDispute',
    'MovingInvoice', 'MovingPayment', 'MovingTrackingPoint',
    'MoverApplication', 'Mover', 'NotificationEmail', 'PaymentWebhookEvent',
    'UserNotification', 'RenterNotification', 'SubscriptionRenewalAttempt',
    'SupportTicket', 'TermsAcceptance', 'LandlordPaymentMethod',
    'PropertyUnit', 'RenterUnitAssociation', 'ListingMedia',
    'ExchangeRateCache', 'PMSSubscriptionNotification', 'PlatformSettings',
    'CommunityPost', 'Review', 'RentInvoicePeriod', 'RentInvoice',
    'RentPaymentIntent', 'RentPaymentSubmission', 'RentPayment',
    'RentReminderSetting', 'RentReminder',
]
