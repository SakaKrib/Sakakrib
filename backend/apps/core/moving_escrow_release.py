from django.core.exceptions import ValidationError
from django.utils import timezone

from .domain_bookings import Booking, MovingDispute
from .moving_payment_services import release_moving_escrow as _release_moving_escrow


@__import__("django.db", fromlist=["transaction"]).transaction.atomic
def release_moving_escrow(*, admin_user_id, booking_id):
    """Release through the existing escrow service only after both parties confirm."""
    booking = Booking.objects.select_for_update().filter(pk=booking_id).first()
    if booking is None:
        raise ValidationError("Booking not found")
    if not booking.renter_confirmed_delivery_at:
        raise ValidationError("Renter must confirm safe delivery before escrow release")
    if not booking.mover_confirmed_delivery_at:
        raise ValidationError("Mover must confirm delivery before escrow release")
    if booking.dispute_status == "OPEN":
        raise ValidationError("Escrow release blocked while dispute is open")
    if booking.dispute_status == "RESOLVED":
        resolution = (
            MovingDispute.objects.filter(booking_id=booking.id, status="RESOLVED")
            .order_by("-resolved_at")
            .values_list("resolution_code", flat=True)
            .first()
        )
        if resolution != "RELEASE_TO_MOVER":
            raise ValidationError("Resolved dispute does not authorize mover payout")

    return _release_moving_escrow(
        admin_user_id=admin_user_id,
        booking_id=booking_id,
    )
