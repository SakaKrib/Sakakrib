"""Reusable queryset scopes implementing the production Supabase RLS rules.

The destination Django API must never rely on a client-provided owner id for
authorization. These scopes constrain querysets to rows the authenticated user
is allowed to see under the audited production policies.
"""

from django.db.models import Q

from apps.accounts.authorization import is_admin

from .domain_bookings import (
    Booking,
    BookingEvent,
    ChatMessage,
    MovingDispute,
    MovingInvoice,
    MovingPayment,
    MoverPayout,
)
from .domain_platform import Mover
from .domain_property import PropertyUnit
from .domain_rent import RentInvoice, RentPayment, RentPaymentIntent, RentPaymentSubmission


def _user_id(user):
    return str(user.pk)


def bookings_for_user(user):
    """Production bookings SELECT scope: renter, mover owner, or admin."""
    if is_admin(user):
        return Booking.objects.all()
    mover_ids = Mover.objects.filter(user_id=user.pk).values("id")
    return Booking.objects.filter(Q(renter_id=user.pk) | Q(mover_id__in=mover_ids))


def booking_events_for_user(user):
    """Production booking_events SELECT scope."""
    if is_admin(user):
        return BookingEvent.objects.all()
    mover_ids = Mover.objects.filter(user_id=user.pk).values("id")
    return BookingEvent.objects.filter(
        Q(renter_id=user.pk) | Q(mover_profile_id__in=mover_ids) | Q(mover_id=user.pk)
    )


def movers_for_user(user):
    """Production movers SELECT scope: approved/available, own, or admin."""
    if is_admin(user):
        return Mover.objects.all()
    return Mover.objects.filter(
        Q(user_id=user.pk) | Q(approval_status="approved", is_available=True)
    )


def moving_invoices_for_user(user):
    """Production moving_invoices SELECT scope."""
    if is_admin(user):
        return MovingInvoice.objects.all()
    mover_ids = Mover.objects.filter(user_id=user.pk).values("id")
    return MovingInvoice.objects.filter(Q(renter_id=user.pk) | Q(mover_id__in=mover_ids))


def moving_payments_for_user(user):
    """Production moving_payments SELECT scope."""
    if is_admin(user):
        return MovingPayment.objects.all()
    mover_ids = Mover.objects.filter(user_id=user.pk).values("id")
    invoice_ids = MovingInvoice.objects.filter(mover_id__in=mover_ids).values("id")
    return MovingPayment.objects.filter(Q(payer_id=user.pk) | Q(invoice_id__in=invoice_ids))


def mover_payouts_for_user(user):
    """Production mover_payouts SELECT scope: mover owner or admin."""
    if is_admin(user):
        return MoverPayout.objects.all()
    mover_ids = Mover.objects.filter(user_id=user.pk).values("id")
    return MoverPayout.objects.filter(mover_id__in=mover_ids)


def moving_disputes_for_user(user):
    """Production moving_disputes participant SELECT scope."""
    if is_admin(user):
        return MovingDispute.objects.all()
    mover_ids = Mover.objects.filter(user_id=user.pk).values("id")
    participant_booking_ids = Booking.objects.filter(
        Q(renter_id=user.pk) | Q(mover_id__in=mover_ids)
    ).values("id")
    return MovingDispute.objects.filter(
        Q(opened_by=user.pk) | Q(booking_id__in=participant_booking_ids)
    )


def chat_messages_for_user(user):
    """Participant scope for chat_messages."""
    if is_admin(user):
        return ChatMessage.objects.all()
    return ChatMessage.objects.filter(Q(sender_id=user.pk) | Q(receiver_id=user.pk))


def property_units_for_user(user):
    """Production property_units SELECT scope: landlord owner or active renter association.

    The renter association is intentionally evaluated by a correlated subquery
    through the UUID-backed relationship rather than trusting a client-supplied
    renter/unit pair.
    """
    if is_admin(user):
        return PropertyUnit.objects.all()
    from .domain_property import RenterUnitAssociation

    active_unit_ids = RenterUnitAssociation.objects.filter(
        renter_user_id=user.pk,
        status="ACTIVE",
    ).values("unit_id")
    return PropertyUnit.objects.filter(Q(user_id=user.pk) | Q(id__in=active_unit_ids))


def rent_invoices_for_user(user):
    """Production rent_invoices participant SELECT scope."""
    if is_admin(user):
        return RentInvoice.objects.all()
    return RentInvoice.objects.filter(Q(landlord_id=user.pk) | Q(renter_user_id=user.pk))


def rent_payment_submissions_for_user(user):
    """Production rent_payment_submissions participant SELECT scope."""
    if is_admin(user):
        return RentPaymentSubmission.objects.all()
    return RentPaymentSubmission.objects.filter(
        Q(landlord_id=user.pk) | Q(renter_user_id=user.pk)
    )


def rent_payment_intents_for_user(user):
    """Production rent_payment_intents SELECT scope: renter owner."""
    if is_admin(user):
        return RentPaymentIntent.objects.all()
    return RentPaymentIntent.objects.filter(renter_user_id=user.pk)


def rent_payments_for_user(user):
    """Production rent_payments SELECT scope: renter association or landlord owner."""
    if is_admin(user):
        return RentPayment.objects.all()
    from .domain_property import RenterUnitAssociation

    renter_assoc_ids = RenterUnitAssociation.objects.filter(
        renter_user_id=user.pk
    ).values("id")
    return RentPayment.objects.filter(
        Q(renter_assoc_id__in=renter_assoc_ids) | Q(landlord_id=user.pk)
    )
