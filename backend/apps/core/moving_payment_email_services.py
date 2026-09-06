from html import escape

from django.conf import settings
from django.utils import timezone

from apps.accounts.models import Profile

from .domain_bookings import Booking, MovingFinancialDocument, MovingInvoice, MovingPayment
from .domain_platform import Mover, NotificationEmail


def _profile_email(user_id):
    profile = Profile.objects.filter(pk=user_id, is_active=True).first()
    email = str(getattr(profile, "email", "") or "").strip().lower() if profile else ""
    return email


def _queue_once(*, recipient, template_type, subject, html_body, payment_id):
    recipient = str(recipient or "").strip().lower()
    if not recipient:
        return False
    exists = NotificationEmail.objects.filter(
        recipient=recipient,
        template_type=template_type,
        html_body__contains=str(payment_id),
    ).exists()
    if exists:
        return False
    NotificationEmail.objects.create(
        recipient=recipient,
        subject=subject,
        html_body=html_body,
        template_type=template_type,
        status="pending",
        created_at=timezone.now(),
    )
    return True


def queue_moving_payment_emails(payment_id):
    """Queue renter, mover and admin payment confirmations exactly once."""
    payment = MovingPayment.objects.filter(pk=payment_id, status="HELD").first()
    if not payment:
        return {"queued": 0, "reason": "payment_not_held"}

    booking = Booking.objects.filter(pk=payment.booking_id).first()
    invoice = MovingInvoice.objects.filter(pk=payment.invoice_id).first()
    if not booking or not invoice:
        return {"queued": 0, "reason": "booking_or_invoice_missing"}

    renter_email = _profile_email(booking.renter_id)
    mover = Mover.objects.filter(pk=booking.mover_id).first()
    mover_email = _profile_email(mover.user_id) if mover else ""
    admin_emails = list(
        Profile.objects.filter(is_active=True, is_admin=True)
        .exclude(email__isnull=True)
        .values_list("email", flat=True)
    )

    receipt = MovingFinancialDocument.objects.filter(
        booking_id=booking.id, document_type="RENTER_RECEIPT"
    ).first()
    settlement = MovingFinancialDocument.objects.filter(
        booking_id=booking.id, document_type="MOVER_SETTLEMENT"
    ).first()

    amount = f"KES {payment.amount_kes:,.2f}"
    paid_at = payment.paid_at or timezone.now()
    payment_id_text = str(payment.id)
    booking_id = str(booking.id)
    invoice_number = str(invoice.invoice_number or "")
    provider = escape(str(payment.provider or ""))
    provider_reference = escape(str(payment.provider_reference or "N/A"))
    provider_transaction = escape(str(payment.provider_transaction_id or "N/A"))

    base_rows = f"""
      <tr><td>Booking</td><td align=\"right\"><strong>{escape(booking_id)}</strong></td></tr>
      <tr><td>Invoice</td><td align=\"right\"><strong>{escape(invoice_number)}</strong></td></tr>
      <tr><td>Amount</td><td align=\"right\"><strong>{escape(amount)}</strong></td></tr>
      <tr><td>Payment method</td><td align=\"right\"><strong>{provider}</strong></td></tr>
      <tr><td>Provider reference</td><td align=\"right\"><strong>{provider_reference}</strong></td></tr>
      <tr><td>Transaction ID</td><td align=\"right\"><strong>{provider_transaction}</strong></td></tr>
      <tr><td>Paid at</td><td align=\"right\"><strong>{escape(paid_at.isoformat())}</strong></td></tr>
    """

    def page(title, greeting, message, extra=""):
        return f"""<!DOCTYPE html><html><body style=\"margin:0;padding:30px 15px;background:#f6f7f9;color:#222;font-family:Arial,Helvetica,sans-serif;\">
<div style=\"max-width:620px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;\">
<div style=\"padding:28px;text-align:center;background:#fff;\"><h1 style=\"margin:0;color:#255d3a;\">Saka Krib</h1><p style=\"color:#777;margin:8px 0 0;\">Moving payment confirmation</p></div>
<div style=\"padding:30px;\"><h2 style=\"margin-top:0;color:#1b5e20;\">{escape(title)}</h2><p>Hello {escape(greeting)},</p><p style=\"line-height:1.7;color:#444;\">{escape(message)}</p>
<table width=\"100%\" cellpadding=\"8\" cellspacing=\"0\" style=\"border-collapse:collapse;background:#f5f7f6;border-radius:10px;\">{base_rows}{extra}</table>
<p style=\"margin-top:24px;color:#777;font-size:13px;line-height:1.6;\">Payment record: {escape(payment_id_text)}. Please keep this email for your records.</p></div>
<div style=\"padding:20px;text-align:center;background:#1e1e1e;color:#aaa;font-size:12px;\">Saka Krib · support@sakakrib.com</div></div></body></html>"""

    queued = 0
    if renter_email:
        extra = f"<tr><td>Receipt</td><td align=\"right\"><strong>{escape(receipt.document_number if receipt else 'N/A')}</strong></td></tr>"
        if _queue_once(recipient=renter_email, template_type="moving_payment_renter", subject="Saka Krib moving payment receipt", payment_id=payment_id_text, html_body=page("Payment received", "Renter", "Your payment for the moving service has been received and is being held securely until the booking is completed.", extra)):
            queued += 1

    if mover_email:
        extra = f"<tr><td>Settlement</td><td align=\"right\"><strong>{escape(settlement.document_number if settlement else 'N/A')}</strong></td></tr>"
        if settlement:
            extra += f"<tr><td>Mover net settlement</td><td align=\"right\"><strong>KES {settlement.mover_net_kes:,.2f}</strong></td></tr>"
        if _queue_once(recipient=mover_email, template_type="moving_payment_mover", subject="Saka Krib: renter payment received for your move", payment_id=payment_id_text, html_body=page("Renter payment received", mover.driver_full_name if mover else "Mover", "The renter has completed payment for this moving booking. The funds are held securely and your settlement will be released according to the completed-delivery process.", extra)):
            queued += 1

    for admin_email in {str(email or "").strip().lower() for email in admin_emails}:
        if not admin_email:
            continue
        extra = f"<tr><td>Renter ID</td><td align=\"right\"><strong>{escape(str(booking.renter_id))}</strong></td></tr><tr><td>Mover ID</td><td align=\"right\"><strong>{escape(str(booking.mover_id))}</strong></td></tr>"
        if settlement:
            extra += f"<tr><td>Mover net payable</td><td align=\"right\"><strong>KES {settlement.mover_net_kes:,.2f}</strong></td></tr>"
        if _queue_once(recipient=admin_email, template_type="moving_payment_admin", subject="Saka Krib: moving payment received — action tracking", payment_id=payment_id_text, html_body=page("Moving payment received", "Administrator", "A renter has completed payment for a moving booking. Review the payment, escrow status and mover settlement in the admin dashboard.", extra)):
            queued += 1

    return {"queued": queued, "payment_id": payment_id_text, "booking_id": booking_id}
