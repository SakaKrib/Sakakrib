from html import escape
from typing import Any

from .email_templates import _button, _details, _first_name, _layout, _text


def mover_booking_request(notification: dict[str, Any]) -> str:
    """HTML email sent to a mover when a renter requests their service.

    Reuses the shared Saka Krib email shell, detail-table styling, and CTA
    styling so booking notifications remain visually consistent with the
    rest of the notification system.
    """
    first = _first_name(notification)
    renter_name = _text(notification.get("renter_name"), "A renter")
    pickup = _text(notification.get("pickup_address"), "Not provided")
    dropoff = _text(notification.get("dropoff_address"), "Not provided")
    moving_date = _text(notification.get("moving_date"), "Not yet selected")
    distance_km = _text(notification.get("distance_km"), "—")
    total_kes = _text(notification.get("total_amount_kes"), "—")
    payment_status = _text(notification.get("payment_status"), "Unpaid")
    requested_at = _text(notification.get("requested_at"), "Just now")
    expires_at = _text(notification.get("response_expires_at"), "30 minutes after the request")
    booking_id = _text(notification.get("booking_id"))
    booking_url = notification.get("booking_url") or "https://sakakrib.com/#mover-booking-detail/"

    body = f"""
      <div style="padding:32px 25px;text-align:center;background:#eef7f1;border-top:1px solid #d7eadc;border-bottom:1px solid #d7eadc;">
        <div style="width:58px;height:58px;margin:0 auto 15px;border-radius:50%;background:#d5ecd8;line-height:58px;font-size:30px;color:#255d3a;">🚚</div>
        <h2 style="margin:0 0 10px;color:#255d3a;font-size:24px;">New Moving Request</h2>
        <p style="margin:0;color:#4b6350;font-size:14px;line-height:1.6;">A renter has requested your moving service. Please review the request and respond before the response window closes.</p>
      </div>

      <div style="padding:30px;">
        <p style="margin:0 0 16px;font-size:15px;line-height:1.7;">Hello {escape(first)},</p>
        <p style="margin:0 0 18px;color:#444444;font-size:15px;line-height:1.7;">You have received a new moving request from <strong>{escape(renter_name)}</strong>.</p>

        {_details([
            ("Renter", renter_name),
            ("Pickup", pickup),
            ("Drop-off", dropoff),
            ("Moving Date", moving_date),
            ("Distance", f"{distance_km} km" if distance_km != "—" else distance_km),
            ("Estimated Total", f"KES {total_kes}" if total_kes != "—" else total_kes),
            ("Payment Status", payment_status),
            ("Requested", requested_at),
        ], heading="MOVING REQUEST DETAILS", bordered=True, row_padding=12)}

        <div style="margin:25px 0;padding:20px;background:#fff8e6;border:1px solid #f1e3bd;border-left:4px solid #9a6700;border-radius:8px;">
          <p style="margin:0 0 8px;font-size:14px;font-weight:bold;color:#7a5600;">⏱ Response window</p>
          <p style="margin:0;color:#735f35;font-size:14px;line-height:1.7;">Please respond within <strong>30 minutes</strong>. This request expires at approximately <strong>{escape(expires_at)}</strong>.</p>
        </div>

        <div style="margin:25px 0;padding:20px;background:#f8faf9;border:1px solid #dfeae2;border-radius:12px;">
          <h3 style="margin:0 0 10px;font-size:16px;color:#222222;">What you can do</h3>
          <p style="margin:0;color:#555555;font-size:14px;line-height:1.7;">Open the request to review the route, renter information and booking terms. You can then <strong>confirm</strong> the request, mark that you are <strong>not sure</strong>, or <strong>decline</strong> it with a reason.</p>
        </div>

        {_button(booking_url, "Review & Respond to Request", "14px 30px")}
        <div style="text-align:center;margin:14px 0 10px;">
          <a href="https://sakakrib.com" style="display:inline-block;padding:12px 24px;background:#ffffff;color:#255d3a;text-decoration:none;border:1px solid #255d3a;border-radius:8px;font-size:14px;font-weight:bold;">Open Saka Krib</a>
        </div>

        <div style="margin-top:25px;padding:15px 18px;background:#f5f7f6;border-radius:8px;color:#777777;font-size:12px;line-height:1.6;">
          <strong style="color:#555555;">Booking ID:</strong> <span style="word-break:break-all;">{escape(booking_id or "Not available")}</span><br>
          This is an automated Saka Krib notification. Please use the Saka Krib app to respond to the request; the email button does not directly change the booking status.
        </div>
      </div>
    """
    return _layout("New Saka Krib Moving Request", body, "Moving made easier")
