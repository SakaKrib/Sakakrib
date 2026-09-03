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
    heading_color: str = "#255d3a",
    message_color: str = "#4b6350",
    icon: str = "",
    icon_background: str = "#c8e6c9",
    icon_color: str = "#1b5e20",
    icon_size: int = 30,
) -> str:
    icon_html = ""
    if icon:
        icon_html = f"""<div style="width:58px;height:58px;margin:0 auto 15px;border-radius:50%;background:{icon_background};line-height:58px;font-size:{icon_size}px;font-weight:bold;color:{icon_color};">{icon}</div>"""
    return f"""<div style="padding:32px 25px;text-align:center;background:{background};border-top:1px solid {border};border-bottom:1px solid {border};">
      {icon_html}
      <h2 style="margin:0 0 10px;color:{heading_color};font-size:24px;">{escape(heading)}</h2>
      <p style="margin:0;color:{message_color};font-size:14px;line-height:1.6;">{escape(message)}</p>
    </div>"""


def _admin_alert(heading: str, message: str, icon: str) -> str:
    return f"""<div style="padding:28px 25px;text-align:center;background:#fff8e1;border-top:1px solid #f3e5ab;border-bottom:1px solid #f3e5ab;">
      <div style="font-size:38px;line-height:1;">{icon}</div>
      <h2 style="margin:12px 0 8px;color:#7a5600;font-size:23px;">{escape(heading)}</h2>
      <p style="margin:0;color:#806c3c;font-size:14px;line-height:1.6;">{escape(message)}</p>
    </div>"""


def _details(
    rows: list[tuple[str, Any]],
    heading: str = "APPLICATION DETAILS",
    bordered: bool = False,
    row_padding: int = 7,
    heading_letter_spacing: str = "0",
) -> str:
    wrapper_style = (
        "border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;"
        if bordered
        else ""
    )
    container_style = (
        "margin:25px 0;padding:20px;background:#f5f7f6;border-radius:12px;"
        if not bordered
        else ""
    )
    heading_style = (
        f"margin:0 0 12px;color:#777777;font-size:13px;letter-spacing:{heading_letter_spacing};"
    )
    html = f"<div style=\"{container_style}{wrapper_style}\">"
    html += f"<p style=\"{heading_style}\">{escape(heading)}</p>"
    html += "<table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"border-collapse:collapse;\">"
    items = [(label, value) for label, value in rows if value not in (None, "")]
    for index, (label, value) in enumerate(items):
        last = index == len(items) - 1
        border_bottom = "" if (last and bordered) else "border-bottom:1px solid #eeeeee;" if bordered else ""
        status_color = ""
        if str(label).lower() == "status":
            normalized = str(value).lower()
            if "approved" in normalized and "not" not in normalized:
                status_color = "color:#1b5e20;"
            elif "not approved" in normalized:
                status_color = "color:#b42318;"
            elif "pending" in normalized or "review" in normalized:
                status_color = "color:#9a6700;"
        label_style = f"padding:{row_padding}px{' ' + str(row_padding) + 'px' if bordered else ' 0'};color:#777777;font-size:{13 if bordered else 14}px;{border_bottom}"
        value_style = f"padding:{row_padding}px{' ' + str(row_padding) + 'px' if bordered else ' 0'};text-align:right;font-size:{13 if bordered else 14}px;font-weight:bold;word-break:break-word;{border_bottom}{status_color}"
        html += f"<tr><td style=\"{label_style}\">{escape(str(label))}</td><td style=\"{value_style}\">{escape(str(value))}</td></tr>"
    html += "</table></div>"
    return html


def _body(content: str) -> str:
    return f"<div style=\"padding:30px;\">{content}</div>"


def _button(url: Any, label: str, padding: str = "14px 28px") -> str:
    return f"""<div style="text-align:center;margin:30px 0 10px;">
      <a href="{_safe_url(url)}" style="display:inline-block;padding:{padding};background:#255d3a;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:bold;">{escape(label)}</a>
    </div>"""


def application_approved(application: dict) -> str:
    raw = _text(application.get("application_type")).lower()
    role = "Real Estate" if raw in {"realestate", "real_estate"} else raw.title() if raw else "Professional"
    first = _first_name(application)
    applicant_name = (
        _text(application.get("applicant_name"))
        or _text(application.get("full_name"))
        or first
    )
    application_id = application.get("application_id") or application.get("id")
    body = _status_panel(
        "Application Approved",
        f"Congratulations! Your {role.lower()} application has been approved.",
        "#e8f5e9",
        "#c8e6c9",
        heading_color="#1b5e20",
        message_color="#4b6350",
        icon="✓",
        icon_background="#c8e6c9",
        icon_color="#1b5e20",
    )
    content = f"""
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;">Hello {escape(first)},</p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#444444;">We are pleased to let you know that your <strong>{escape(role.lower())}</strong> application on Saka Krib has been successfully reviewed and approved.</p>
      {_details([('Applicant', applicant_name), ('Application Type', role), ('Status', 'Approved'), ('Application ID', application_id)])}
      <div style="margin:25px 0;padding:20px;border:1px solid #d9e8dc;border-radius:12px;background:#f8fbf9;">
        <h3 style="margin:0 0 12px;font-size:16px;color:#222222;">What happens next?</h3>
        <p style="margin:0;color:#555555;font-size:14px;line-height:1.7;">Your account now has access to the {escape(role.lower())} features available on Saka Krib. You can sign in and continue using your account.</p>
      </div>
      {_button(application.get('dashboard_url'), 'Open Saka Krib')}
      <p style="margin:25px 0 0;color:#555555;font-size:14px;line-height:1.7;">Thank you for choosing Saka Krib. We look forward to serving you.</p>
    """
    return _layout("Application Approved", body + _body(content))


def application_declined(application: dict) -> str:
    raw = _text(application.get("application_type")).lower()
    role = "Real Estate" if raw in {"realestate", "real_estate"} else raw.title() if raw else "Professional"
    first = _first_name(application)
    applicant_name = _text(application.get("applicant_name")) or _text(application.get("full_name")) or first
    application_id = application.get("application_id") or application.get("id") or application.get("applicant", {}).get("id")
    reason = _text(application.get("admin_review_note")) or _text(application.get("decline_reason")) or _text(application.get("review_notes"))
    body = _status_panel(
        "Application Update",
        f"We have completed the review of your {role.lower()} application.",
        "#fff3f3",
        "#f3d2d2",
        heading_color="#b42318",
        message_color="#6b4a4a",
        icon="!",
        icon_background="#fde8e8",
        icon_color="#b42318",
        icon_size=28,
    )
    reason_html = ""
    if reason:
        reason_html = f"""<div style="margin:25px 0;padding:20px;background:#fff8f8;border:1px solid #f1d1d1;border-left:4px solid #b42318;border-radius:8px;">
          <p style="margin:0 0 8px;font-size:14px;font-weight:bold;color:#8f1d16;">Reason for this decision</p>
          <p style="margin:0;color:#555555;font-size:14px;line-height:1.7;white-space:pre-line;">{escape(reason)}</p>
        </div>"""
    content = f"""
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;">Hello {escape(first)},</p>
      <p style="margin:0 0 16px;color:#444444;font-size:15px;line-height:1.7;">Thank you for your interest in becoming a <strong>{escape(role.lower())}</strong> on Saka Krib.</p>
      <p style="margin:0 0 20px;color:#444444;font-size:15px;line-height:1.7;">Unfortunately, after reviewing the information and documents provided, your application was not approved at this time.</p>
      {_details([('Applicant', applicant_name), ('Application Type', role), ('Status', 'Not Approved'), ('Application ID', application_id)])}
      {reason_html}
      <div style="margin:25px 0;padding:20px;border:1px solid #e5e7eb;border-radius:12px;">
        <h3 style="margin:0 0 12px;font-size:16px;color:#222222;">Need clarification?</h3>
        <p style="margin:0;color:#555555;font-size:14px;line-height:1.7;">If you believe this decision was made in error or you need clarification regarding your application, please contact the Saka Krib support team.</p>
        <p style="margin:15px 0 0;font-size:14px;"><a href="mailto:{SUPPORT_EMAIL}" style="color:#255d3a;font-weight:bold;text-decoration:none;">{SUPPORT_EMAIL}</a></p>
      </div>
      <p style="margin:25px 0 0;color:#555555;font-size:14px;line-height:1.7;">Thank you for your interest in Saka Krib.</p>
    """
    return _layout("Application Update", body + _body(content))


def application_review(application: dict) -> str:
    raw = _text(application.get("application_type")).lower()
    role = "Real Estate" if raw in {"realestate", "real_estate"} else raw.title() if raw else "Mover"
    first = _first_name(application)
    body = _status_panel(
        "Application Under Review",
        f"Our team is currently reviewing your {role.lower()} application.",
        "#fff8e6",
        "#f3e5ab",
        heading_color="#7a5200",
        message_color="#735f35",
        icon="⏳",
        icon_background="#fff0c2",
        icon_color="#9a6700",
        icon_size=28,
    )
    content = f"""
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;">Hello {escape(first)},</p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#444444;">We wanted to let you know that your application to become a <strong>{escape(role.lower())}</strong> on Saka Krib is currently being reviewed by our team.</p>
      {_details([('Application Type', role), ('Status', 'Under Review'), ('Application ID', application.get('application_id') or application.get('id')), ('Operating City', application.get('operating_city'))], heading_letter_spacing='0.5px')}
      <div style="margin:25px 0;padding:20px;border:1px solid #e5e7eb;border-radius:12px;">
        <h3 style="margin:0 0 12px;font-size:16px;color:#222222;">What happens next?</h3>
        <p style="margin:0;color:#555555;font-size:14px;line-height:1.7;">Our team will review the information and documents you provided. Once the review is complete, you will receive another email informing you whether your application has been approved or declined.</p>
      </div>
      <div style="margin:25px 0;padding:18px;background:#f8faf9;border-left:4px solid #255d3a;border-radius:6px;">
        <p style="margin:0;color:#526158;font-size:14px;line-height:1.7;"><strong>Please do not submit another application.</strong> Your current application is already being reviewed. We will notify you once a decision has been made.</p>
      </div>
      <p style="margin:25px 0 0;color:#555555;font-size:14px;line-height:1.7;">Thank you for choosing Saka Krib.</p>
    """
    return _layout("Your Application Is Under Review", body + _body(content))


def listing_approved(notification: dict) -> str:
    first = _first_name(notification)
    title = _text(notification.get("listing_title"), "Your property listing")
    listing_id = notification.get("listing_id") or notification.get("id")
    city = _text(notification.get("city"))
    county = _text(notification.get("county"))
    location = ", ".join(part for part in (city, county) if part)
    listing_url = notification.get("listing_url") or (f"{SITE_URL}/listing/{listing_id}" if listing_id else SITE_URL)
    body = _status_panel(
        "Listing Approved",
        "Your property listing has been approved and is now live.",
        "#e8f5e9",
        "#c8e6c9",
        heading_color="#1b5e20",
        message_color="#4b6350",
        icon="✓",
        icon_background="#c8e6c9",
        icon_color="#1b5e20",
    )
    content = f"""
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;">Hello {escape(first)},</p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#444444;">Your listing <strong>{escape(title)}</strong> has been reviewed and approved by the Saka Krib administration team.</p>
      {_details([('Listing', title), ('Location', location), ('Listing ID', listing_id), ('Status', 'Approved and Published')])}
      {_button(listing_url, 'View Listing')}
    """
    return _layout("Listing Approved", body + _body(content))


def landlord_application_submitted(application: dict) -> str:
    kind = "Real Estate" if _text(application.get("application_type")).lower() in {"realestate", "real_estate"} else "Landlord"
    first = _first_name(application)
    submitted_at = _text(application.get("submitted_at"), "Just now")
    body = _status_panel(
        "Application Submitted",
        f"Your {kind.lower()} application has been successfully submitted.",
        "#e8f5e9",
        "#c8e6c9",
        heading_color="#1b5e20",
        message_color="#4b6350",
        icon="✓",
        icon_background="#c8e6c9",
        icon_color="#1b5e20",
    )
    content = f"""
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;">Hello {escape(first)},</p>
      <p style="margin:0 0 16px;color:#444444;font-size:15px;line-height:1.7;">Thank you for applying to become a <strong>{kind.lower()}</strong> on Saka Krib. Your application has been received successfully and is now awaiting administrator review.</p>
      {_details([('Applicant', application.get('applicant_name') or application.get('full_name')), ('Application Type', kind), ('Status', 'Pending Review'), ('Application ID', application.get('application_id') or application.get('id')), ('Submitted', submitted_at)])}
      <div style="margin:25px 0;padding:20px;border:1px solid #e5e7eb;border-radius:12px;">
        <h3 style="margin:0 0 12px;font-size:16px;color:#222222;">What happens next?</h3>
        <p style="margin:0;color:#555555;font-size:14px;line-height:1.7;">Our administration team will review the information and identity document you provided. Once the review is complete, you will receive another email informing you whether your application has been approved or declined.</p>
      </div>
      <p style="margin:25px 0 0;color:#555555;font-size:14px;line-height:1.7;">You do not need to submit another application while this application is under review.</p>
      <p style="margin:20px 0 0;color:#555555;font-size:14px;line-height:1.7;">Thank you for choosing Saka Krib.</p>
    """
    return _layout(f"{kind} Application Submitted", body + _body(content))


def mover_application_submitted(application: dict) -> str:
    first = _first_name(application)
    vehicle_type = _text(application.get("vehicle_type"), "Not provided")
    operating_city = _text(application.get("operating_city"), "Not provided")
    operating_county = _text(application.get("operating_county"), "Not provided")
    application_id = application.get("application_id") or application.get("id")
    submitted_at = _text(application.get("submitted_at"), "Just now")
    body = _status_panel(
        "Application Submitted",
        "Your mover application has been successfully submitted and is now awaiting review.",
        "#e8f5e9",
        "#d8ead9",
        heading_color="#1b5e20",
        message_color="#4b6350",
        icon="✓",
        icon_background="#d5ecd8",
        icon_color="#1b5e20",
        icon_size=28,
    )
    content = f"""
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;">Hello {escape(first)},</p>
      <p style="margin:0 0 18px;color:#444444;font-size:15px;line-height:1.7;">Thank you for applying to become a <strong>mover</strong> on Saka Krib. We have successfully received your application.</p>
      {_details([('Application', 'Mover Registration'), ('Status', 'Pending Review'), ('Vehicle Type', vehicle_type), ('Operating City', operating_city), ('County', operating_county)])}
      <div style="margin:20px 0;padding:16px;background:#f8faf9;border-radius:10px;font-size:13px;color:#666666;">
        <strong style="color:#333333;">Application ID:</strong> <span style="word-break:break-all;">{escape(_text(application_id))}</span><br>
        <strong style="color:#333333;">Submitted:</strong> {escape(submitted_at)}
      </div>
      <div style="margin:25px 0;padding:20px;border:1px solid #e5e7eb;border-radius:12px;">
        <h3 style="margin:0 0 12px;font-size:16px;color:#222222;">What happens next?</h3>
        <p style="margin:0;color:#555555;font-size:14px;line-height:1.7;">Our team will review the information and documents you provided. Once the review is complete, you will receive another email informing you whether your application has been approved or declined.</p>
      </div>
      <p style="margin:20px 0 0;color:#555555;font-size:14px;line-height:1.7;">You do not need to submit another application while this application is being reviewed.</p>
      <p style="margin:20px 0 0;color:#555555;font-size:14px;line-height:1.7;">Thank you for choosing Saka Krib.</p>
    """
    return _layout("Mover Application Submitted", body + _body(content), "Moving made easier")


def landlord_admin_notification(application: dict) -> str:
    applicant_name = _text(application.get("applicant_name")) or _text(application.get("full_name"), "Unknown applicant")
    applicant_email = _text(application.get("applicant_email")) or _text(application.get("email"), "Not provided")
    phone = _text(application.get("phone"), "Not provided")
    national_id = _text(application.get("national_id"), "Not provided")
    document_type = _text(application.get("document_type"), "Not provided")
    application_id = application.get("application_id") or application.get("id") or "Pending assignment"
    submitted_at = _text(application.get("submitted_at"), "Just now")
    body = _admin_alert("New Landlord Application", "A new landlord application has been submitted and requires administrator review.", "🏢")
    content = f"""
      <h3 style="margin:0 0 18px;font-size:18px;color:#222222;">Application Summary</h3>
      {_details([('Applicant', applicant_name), ('Email', applicant_email), ('Phone', phone), ('National ID', national_id), ('Document Type', document_type)], bordered=True, row_padding=13)}
      <div style="margin-top:22px;padding:18px;background:#f5f7f6;border-radius:10px;">
        <div style="font-size:12px;color:#777777;">Application Status</div>
        <div style="margin-top:5px;font-size:16px;font-weight:bold;color:#b26a00;">Pending Review</div>
      </div>
      <div style="margin-top:18px;font-size:12px;color:#777777;line-height:1.7;"><strong>Application ID:</strong> {escape(_text(application_id))}<br><strong>Submitted:</strong> {escape(submitted_at)}</div>
      {_button(f'{SITE_URL}/admin', 'Review Application')}
      <div style="margin-top:25px;padding:18px;background:#f8faf9;border-left:4px solid #255d3a;border-radius:6px;color:#526158;font-size:13px;line-height:1.6;"><strong>Administrator action required</strong><br><br>Please review the applicant's identity information and uploaded document before approving or declining the landlord application.</div>
    """
    return _layout("New Landlord Application", body + "<div style=\"padding:30px 25px;\">" + content + "</div>", "Administration Notification")


def mover_admin_notification(application: dict) -> str:
    applicant_name = _text(application.get("applicant_name")) or _text(application.get("driver_full_name")) or _text(application.get("full_name"), "Unknown applicant")
    applicant_email = _text(application.get("applicant_email")) or _text(application.get("email"), "Not provided")
    phone = _text(application.get("phone"), "Not provided")
    vehicle_type = _text(application.get("vehicle_type"), "Not provided")
    vehicle_number = _text(application.get("number_plate")) or _text(application.get("vehicle_number"), "Not provided")
    operating_city = _text(application.get("operating_city"), "Not provided")
    operating_county = _text(application.get("operating_county"), "Not provided")
    application_id = application.get("application_id") or application.get("id") or "Pending assignment"
    submitted_at = _text(application.get("submitted_at"), "Just now")
    body = _admin_alert("New Mover Application", "A new mover application has been submitted and requires administrator review.", "🚚")
    content = f"""
      <h3 style="margin:0 0 18px;font-size:18px;color:#222222;">Application Summary</h3>
      {_details([('Applicant', applicant_name), ('Email', applicant_email), ('Phone', phone), ('Vehicle Type', vehicle_type), ('Number Plate', vehicle_number), ('Operating City', operating_city), ('County', operating_county)], bordered=True, row_padding=13)}
      <div style="margin-top:22px;padding:18px;background:#f5f7f6;border-radius:10px;"><div style="font-size:12px;color:#777777;">Application Status</div><div style="margin-top:5px;font-size:16px;font-weight:bold;color:#b26a00;">Pending Review</div></div>
      <div style="margin-top:18px;font-size:12px;color:#777777;line-height:1.7;"><strong>Application ID:</strong> {escape(_text(application_id))}<br><strong>Submitted:</strong> {escape(submitted_at)}</div>
      {_button(f'{SITE_URL}/admin', 'Review Application')}
      <div style="margin-top:25px;padding:18px;background:#f8faf9;border-left:4px solid #255d3a;border-radius:6px;color:#526158;font-size:13px;line-height:1.6;"><strong>Administrator action required</strong><br><br>Please review the applicant's identity, driving licence, vehicle information, insurance details, inspection status and references before approving or declining the application.</div>
    """
    return _layout("New Mover Application", body + "<div style=\"padding:30px 25px;\">" + content + "</div>", "Administration Notification")


def otp_verification(application: dict) -> str:
    first = _first_name(application)
    otp = _text(application.get("otp") or application.get("verification_code") or application.get("code"))
    purpose = _text(application.get("purpose"), "verify your account")
    body = _status_panel(
        "Verification Code",
        f"Use the code below to {purpose}.",
        "#f1f7f3",
        "#dfeae2",
        heading_color="#255d3a",
        message_color="#5f6f64",
        icon="✓",
        icon_background="#255d3a",
        icon_color="#ffffff",
        icon_size=27,
    )
    content = f"""
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#333333;">Hello {escape(first)},</p>
      <p style="margin:0 0 18px;font-size:14px;line-height:1.7;color:#555555;">We received a request to {escape(purpose)}. Enter the verification code below to continue.</p>
      <div style="margin:30px 0;padding:24px;text-align:center;background:#f5f7f6;border:1px solid #e1e7e3;border-radius:12px;">
        <p style="margin:0 0 12px;color:#777777;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Verification Code</p>
        <div style="font-size:32px;line-height:1.3;font-weight:bold;letter-spacing:8px;color:#255d3a;">{escape(otp)}</div>
      </div>
      <div style="padding:18px;background:#fff8e8;border:1px solid #f1e3bd;border-radius:10px;color:#765d20;font-size:13px;line-height:1.6;"><strong>Keep your verification code private.</strong><br><br>This code expires shortly. Never share it with anyone, including someone claiming to be from Saka Krib.</div>
      <p style="margin:25px 0 0;color:#777777;font-size:13px;line-height:1.6;">If you did not request this verification code, you can safely ignore this email. Your account remains secure.</p>
    """
    return _layout("Saka Krib Verification Code", body + _body(content), "Moving made easier")


def sign_in_notification(user: dict) -> str:
    email = _text(user.get("email"))
    sign_in_time = _text(user.get("sign_in_time"))
    device = _text(user.get("device"))
    location = _text(user.get("location"))
    security_url = user.get("security_url") or SITE_URL
    body = _status_panel(
        "Successful Sign In",
        "Your Saka Krib account was successfully accessed.",
        "#eef6ff",
        "#eef6ff",
        heading_color="#1e4f7a",
        message_color="#4b6073",
        icon="🔐",
        icon_background="#dbeafe",
        icon_color="#1e4f7a",
        icon_size=28,
    )
    rows = [("Account", email), ("Date & Time", sign_in_time), ("Device", device), ("Location", location)]
    content = f"""
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;">Hello {escape(_first_name(user))},</p>
      <p style="margin:0 0 20px;color:#444444;font-size:15px;line-height:1.7;">We detected a successful sign in to your Saka Krib account.</p>
      {_details(rows, heading="SIGN-IN DETAILS")}
      <div style="margin:25px 0;padding:18px;background:#fff8e6;border:1px solid #f1e3bd;border-radius:10px;color:#735f35;font-size:13px;line-height:1.6;"><strong>Wasn't you?</strong><br><br>If you did not sign in to your account, please review your account security and contact Saka Krib support if you notice anything suspicious.</div>
      {_button(security_url, 'Review Account Security', '14px 30px')}
      <p style="margin:0;color:#777777;font-size:13px;line-height:1.6;">If you recognize this sign-in, no action is required. This notification was sent to help keep your Saka Krib account secure.</p>
    """
    return _layout("New Sign In to Your Saka Krib Account", body + _body(content), "Account Security Notification")


def sign_up_welcome(user: dict) -> str:
    full_name = _text(user.get("full_name"))
    email = _text(user.get("email"))
    dashboard_url = user.get("dashboard_url") or SITE_URL
    body = _status_panel(
        "Welcome to Saka Krib",
        "Your account has been successfully created.",
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
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#333333;">Hello {escape(_first_name(user))},</p>
      <p style="margin:0 0 18px;color:#444444;font-size:15px;line-height:1.7;">Welcome to Saka Krib. Your account has been successfully created and you can now start using the platform.</p>
      {_details([('Name', full_name), ('Email', email)], heading="ACCOUNT DETAILS")}
      <div style="margin:25px 0;padding:20px;border:1px solid #e5e7eb;border-radius:12px;">
        <h3 style="margin:0 0 12px;color:#222222;font-size:16px;">You're ready to get started</h3>
        <p style="margin:0;color:#555555;font-size:14px;line-height:1.7;">Sign in to your Saka Krib account to manage your profile and access the services available to you.</p>
      </div>
      {_button(dashboard_url, 'Open Saka Krib', '14px 30px')}
      <p style="margin:0;color:#777777;font-size:13px;line-height:1.6;">If you did not create this account, please contact Saka Krib support immediately.</p>
    """
    return _layout("Welcome to Saka Krib", body + _body(content))


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
}
