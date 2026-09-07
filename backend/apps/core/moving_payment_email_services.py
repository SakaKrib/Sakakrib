from html import escape

from django.utils import timezone

from apps.accounts.models import Profile

from .domain_bookings import Booking, MovingInvoice, MovingPayment
from .domain_financial import MovingFinancialDocument
from .domain_platform import Mover, NotificationEmail
from .email_templates import _body, _details, _layout, _status_panel


def _profile_email(user_id):
    profile = Profile.objects.filter(pk=user_id, is_active=True).first()
    return str(getattr(profile, "email", "") or "").strip().lower() if profile else ""


def _queue_once(*, recipient, template_type, subject, html_body, payment_id):
    recipient = str(recipient or "").strip().lower()
    if not recipient:
        return False
    if NotificationEmail.objects.filter(
        recipient=recipient,
        template_type=template_type,
        html_body__contains=str(payment_id),
    ).exists():
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


def _payment_rows(payment, booking, invoice):
    paid_at = payment.paid_at or timezone.now()
    return [
        ("Booking", str(booking.id)),
        ("Invoice", str(invoice.invoice_number or "N/A")),
        ("Amount", f"KES {payment.amount_kes:,.2f}"),
        ("Payment method", str(payment.provider or "N/A")),
        ("Provider reference", str(payment.provider_reference or "N/A")),
        ("Transaction ID", str(payment.provider_transaction_id or "N/A")),
        ("Paid at", paid_at.strftime("%d %b %Y, %H:%M")),
    ]


def _payment_email(*, title, message, rows, extra_rows=(), panel_message=None, panel_heading=None):
    panel = _status_panel(
        panel_heading or title,
        panel_message or message,
        "#e8f5e9",
        "#c8e6c9",
        heading_color="#1b5e20",
        message_color="#4b6350",
        icon="✓",
        icon_background="#c8e6c9",
        icon_color="#1b5e20",
    )
    content = (
        f'<p style="margin:0 0 16px;font-size:15px;line-height:1.7;">Hello,</p>'
        f'<p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#444444;">{escape(message)}</p>'
        f'{_details(list(rows) + list(extra_rows), heading="PAYMENT DETAILS", bordered=True)}'
    )
    return _layout("Moving Payment Confirmation", panel + _body(content))


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

    rows = _payment_rows(payment, booking, invoice)
    pid = str(payment.id)
    bid = str(booking.id)
    queued = 0

    if renter_email:
        extra = [("Receipt", receipt.document_number if receipt else "N/A")]
        html = _payment_email(
            title="Payment received",
            message="Your moving payment has been received and is being held securely until delivery is confirmed.",
            rows=rows,
            extra_rows=extra,
            panel_heading="Payment received",
            panel_message="Your moving payment was received successfully.",
        )
        if _queue_once(
            recipient=renter_email,
            template_type="moving_payment_renter",
            subject="Saka Krib moving payment receipt",
            payment_id=pid,
            html_body=html,
        ):
            queued += 1

    if mover_email:
        extra = [("Settlement", settlement.document_number if settlement else "N/A")]
        if settlement:
            extra.append(("Mover net settlement", f"KES {settlement.mover_net_kes:,.2f}"))
        html = _payment_email(
            title="Renter payment received",
            message="The renter has completed payment for this moving booking. The funds are held securely and settlement will follow the completed-delivery process.",
            rows=rows,
            extra_rows=extra,
            panel_heading="Renter payment received",
            panel_message="Payment is confirmed and securely held for this booking.",
        )
        if _queue_once(
            recipient=mover_email,
            template_type="moving_payment_mover",
            subject="Saka Krib: renter payment received for your move",
            payment_id=pid,
            html_body=html,
        ):
            queued += 1

    for admin_email in {str(email or "").strip().lower() for email in admin_emails}:
        if not admin_email:
            continue
        extra = [
            ("Renter ID", str(booking.renter_id)),
            ("Mover ID", str(booking.mover_id)),
        ]
        if settlement:
            extra.append(("Mover net payable", f"KES {settlement.mover_net_kes:,.2f}"))
        html = _payment_email(
            title="Moving payment received",
            message="A renter has completed payment for a moving booking. Review the payment, escrow status and mover settlement in the admin dashboard.",
            rows=rows,
            extra_rows=extra,
            panel_heading="Moving payment received",
            panel_message="A new moving payment is confirmed and held in escrow.",
        )
        if _queue_once(
            recipient=admin_email,
            template_type="moving_payment_admin",
            subject="Saka Krib: moving payment received — action tracking",
            payment_id=pid,
            html_body=html,
        ):
            queued += 1

    return {"queued": queued, "payment_id": pid, "booking_id": bid}
