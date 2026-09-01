"""Schema-complete domain models imported into the core app during migration.

The concrete models remain split into focused modules so the frozen Supabase
schema can be mapped without coupling them to Django ForeignKeys prematurely.
"""

from .domain_bookings import (
    Booking,
    BookingEvent,
    ChatMessage,
    MoverPayout,
    MoverScheduleEvent,
    MovingCancellationEvent,
    MovingDispute,
    MovingInvoice,
    MovingPayment,
    MovingTrackingPoint,
)

__all__ = [
    'Booking', 'BookingEvent', 'ChatMessage', 'MoverPayout',
    'MoverScheduleEvent', 'MovingCancellationEvent', 'MovingDispute',
    'MovingInvoice', 'MovingPayment', 'MovingTrackingPoint',
]
