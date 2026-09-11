from django.core.exceptions import ValidationError
from django.db import transaction

from .domain_bookings import MovingPayment
from .moving_payment_services import _booking, _money, _paypal_json, _paypal_token, _require_invoice, _settle_payment


@transaction.atomic
def capture_moving_paypal_payment(*, renter_id, booking_id, order_id):
    booking = _booking(booking_id)
    if booking.renter_id != renter_id:
        raise ValidationError("Booking not found")
    if booking.status != "confirmed":
        raise ValidationError("Booking must be confirmed before payment")
    if booking.payment_status == "paid":
        return {"success": True, "status": "ALREADY_PROCESSED", "booking_id": str(booking.id)}

    order_id = str(order_id or "").strip()
    if not order_id:
        raise ValidationError("PayPal order id is required")

    payment = MovingPayment.objects.select_for_update().filter(
        provider="PAYPAL",
        booking_id=booking.id,
        provider_reference=order_id,
    ).first()
    if payment is None:
        raise ValidationError("PayPal payment attempt was not found")
    if payment.status in {"HELD", "RELEASED"}:
        return {"success": True, "status": "ALREADY_PROCESSED", "payment_id": str(payment.id), "booking_id": str(booking.id)}

    token = _paypal_token()
    try:
        order = _paypal_json(f"/v2/checkout/orders/{order_id}/capture", method="POST", token=token, body={})
    except RuntimeError:
        # The buyer may have completed the PayPal flow in another tab or the
        # webhook may already have settled it. Re-read the order before failing.
        order = _paypal_json(f"/v2/checkout/orders/{order_id}", token=token)

    order_status = str(order.get("status") or "").upper()
    if order_status == "COMPLETED":
        capture = (((order.get("purchase_units") or [{}])[0].get("payments") or {}).get("captures") or [{}])[0]
        amount = _money(((capture.get("amount") or {}).get("value")) or 0)
        currency = str((capture.get("amount") or {}).get("currency_code") or "USD").upper()
        if amount <= 0 or payment.provider_amount is None or _money(payment.provider_amount) != amount:
            raise ValidationError("PayPal amount does not match stored payment")
        if currency != "USD":
            raise ValidationError("PayPal returned an unexpected currency")
        capture_id = capture.get("id") or order_id
        invoice = _require_invoice(booking)
        return {"success": True, **_settle_payment(payment, booking, invoice, provider_transaction_id=capture_id, provider_currency=currency, provider_amount=amount, paypal_order_id=order_id)}

    if order_status in {"VOIDED", "COMPLETED"}:
        payment.status = "FAILED"
        payment.save(update_fields=["status", "updated_at"])
        raise ValidationError("PayPal payment was not completed")

    raise ValidationError(f"PayPal payment is not complete (status: {order_status or 'UNKNOWN'})")
