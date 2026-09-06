from datetime import datetime
from html import escape
from typing import Any


SITE_URL = "https://sakakrib.com"
SUPPORT_EMAIL = "support@sakakrib.com"


# The live Supabase send-notification-emails function uses one consistent
# email shell: a 600px white card on #f6f7f9, Saka Krib green branding,
# inline CSS, status/alert panels, detail tables, action buttons, and a
# dark footer. Django owns delivery now, but this HTML architecture remains
# the source-of-truth presentation layer.


def _text(value: Any, default: str = "") -> str:
    value = "" if value is None else str(value).strip()
    return value or default


def _first_name(application: dict) -> str:
    applicant = application.get("applicant") or {}
    user = application.get("user") or {}
    name = (
        _text(application.get("full_name"))
        or _text(application.get("applicant_name"))
        or _text(application.get("driver_full_name"))
        or _text(applicant.get("full_name"))
        or _text(user.get("full_name"))
        or ""
    )
    return name.split()[0] if name else "there"


def _safe_url(value: Any, default: str = SITE_URL) -> str:
    value = _text(value, default)
    if not value.lower().startswith(("http://", "https://")):
        value = default
    return escape(value, quote=True)


def _layout(
    title: str,
    body: str,
    tagline: str = "Moving, renting and property services made easier.",
) -> str:
    year = datetime.now().year
    return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{escape(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f6f7f9;color:#222222;font-family:Arial,Helvetica,sans-serif;">
  <div style="width:100%;padding:30px 15px;background:#f6f7f9;box-sizing:border-box;">
    <div style="width:100%;max-width:600px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;">
      <div style="padding:30px;text-align:center;background:#ffffff;">
        <h1 style="margin:0;color:#255d3a;font-size:30px;">Saka Krib</h1>
        <p style="margin:8px 0 0;color:#777777;font-size:14px;">{escape(tagline)}</p>
      </div>
      {body}
      <div style="padding:25px;text-align:center;background:#1e1e1e;color:#aaaaaa;font-size:12px;">
        <strong style="color:#ffffff;font-size:14px;">Saka Krib</strong>
        <p style="margin:10px 0;line-height:1.6;">{escape(tagline)}</p>
        <p style="margin:10px 0;">
          <a href="mailto:{SUPPORT_EMAIL}" style="color:#7fcf9a;text-decoration:none;">{SUPPORT_EMAIL}</a>
        </p>
        <hr style="border:none;border-top:1px solid #444444;margin:18px 0;">
        <p style="margin:0;color:#888888;">© {year} Saka Krib. All rights reserved.</p>
      </div>
    </div>
  </div>
</body>
</html>"""


def _status_panel(
    heading: str,
    message: str,
    background: str,
    border: str,
    heading_color: str = "#1b5e20",
    message_color: str = "#4b6350",
    icon: str = "✓",
    icon_background: str = "#255d3a",
    icon_color: str = "#ffffff",
    icon_size: int = 28,
) -> str:
    return f"""
      <div style="margin:0 0 24px;padding:20px;background:{background};border:1px solid {border};border-radius:12px;display:flex;align-items:flex-start;gap:14px;">
        <div style="flex:0 0 auto;width:44px;height:44px;border-radius:50%;background:{icon_background};color:{icon_color};font-size:{icon_size}px;line-height:44px;text-align:center;">{escape(icon)}</div>
        <div>
          <h2 style="margin:0 0 6px;color:{heading_color};font-size:20px;">{escape(heading)}</h2>
          <p style="margin:0;color:{message_color};font-size:14px;line-height:1.6;">{escape(message)}</p>
        </div>
      </div>
    """


def _details(rows, heading="DETAILS") -> str:
    cells = []
    for label, value in rows:
        cells.append(
            f"<tr><td style=\"padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#666;\">{escape(str(label))}</td>"
            f"<td style=\"padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#222;text-align:right;font-weight:600;\">{escape(str(value))}</td></tr>"
        )
    return f"""
      <div style="margin:22px 0;">
        <p style="margin:0 0 8px;color:#255d3a;font-size:12px;font-weight:700;letter-spacing:1px;">{escape(heading)}</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
          {''.join(cells)}
        </table>
      </div>
    """


def _button(url: Any, label: str, padding: str = "14px 30px") -> str:
    return f"<p style=\"margin:25px 0;\"><a href=\"{_safe_url(url)}\" style=\"display:inline-block;padding:{padding};background:#255d3a;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;\">{escape(label)}</a></p>"


def _body(content: str) -> str:
    return f"<div style=\"padding:0 30px 30px;\">{content}</div>"


def moving_started(data: dict) -> str:
    first_name = _first_name(data)
    tracking_number = _text(data.get("tracking_number"), "N/A")
    booking_id = _text(data.get("booking_id"), "N/A")
    started_at = _text(data.get("started_at"), "N/A")
    tracking_url = data.get("tracking_url") or SITE_URL
    body = _status_panel(
        "Your move has started",
        "Your assigned mover has started the journey. You can now follow the move using your tracking number.",
        "#e8f5e9",
        "#d7ead9",
        heading_color="#1b5e20",
        message_color="#4b6350",
        icon="✓",
        icon_background="#255d3a",
        icon_color="#ffffff",
        icon_size=28,
    )
    content = f"""
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#333333;">Hello {escape(first_name)},</p>
      <p style="margin:0 0 18px;color:#444444;font-size:15px;line-height:1.7;">Your mover has started the journey. Saka Krib is now recording the active moving journey so you can follow its progress.</p>
      {_details([('Booking', booking_id), ('Tracking number', tracking_number), ('Journey started', started_at)], heading="JOURNEY DETAILS")}
      {_button(tracking_url, 'Open Saka Krib', '14px 30px')}
      <p style="margin:0;color:#777777;font-size:13px;line-height:1.6;">Keep your tracking number for reference. If you have questions about this move, use your Saka Krib conversation with the mover or contact support.</p>
    """
    return _layout("Your move has started", body + _body(content))


EMAIL_TEMPLATES = {
    "application_approved": application_approved,
    "application_declined": application_declined,
    "application_review": application_review,
    "listing_approved": listing_approved,
    "landlord_application_submitted": landlord_application_submitted,
    "mover_application_submitted": mover_application_submitted,
    "landlord_admin_notification": landlord_admin_notification,
    "mover_admin_notification": mover_admin_notification,
    "otp_verification": otp_verification,
    "sign_in_notification": sign_in_notification,
    "sign_up_welcome": sign_up_welcome,
    "moving_started": moving_started,
}


EMAIL_SUBJECTS = {
    "application_approved": "Your Saka Krib application has been approved",
    "application_declined": "Update regarding your Saka Krib application",
    "application_review": "Your Saka Krib application is under review",
    "listing_approved": "Your Saka Krib listing has been approved",
    "landlord_application_submitted": "Landlord application submitted - Saka Krib",
    "mover_application_submitted": "Mover application submitted - Saka Krib",
    "landlord_admin_notification": "New landlord application requires review - Saka Krib",
    "mover_admin_notification": "New mover application requires review - Saka Krib",
    "otp_verification": "Your Saka Krib verification code",
    "sign_in_notification": "New sign-in to your Saka Krib account",
    "sign_up_welcome": "Welcome to Saka Krib",
    "moving_started": "Your Saka Krib move has started",
}
