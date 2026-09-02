from html import escape
from typing import Any


SITE_URL = "https://sakakrib.com"
SUPPORT_EMAIL = "support@sakakrib.com"


def _text(value: Any, default: str = "") -> str:
    return str(value).strip() if value is not None else default


def _first_name(application: dict) -> str:
    name = (
        _text(application.get("full_name"))
        or _text(application.get("applicant_name"))
        or _text(application.get("driver_full_name"))
        or _text((application.get("applicant") or {}).get("full_name"))
        or _text((application.get("user") or {}).get("full_name"))
    )
    return name.split()[0] if name else "there"


def _layout(title: str, body: str, tagline: str = "Moving, renting and property services made easier.") -> str:
    return f"""<!DOCTYPE html><html><head><meta charset='UTF-8'><meta name='viewport' content='width=device-width,initial-scale=1.0'><title>{escape(title)}</title></head><body style='margin:0;padding:0;background:#f6f7f9;color:#222;font-family:Arial,Helvetica,sans-serif'><div style='padding:30px 15px;background:#f6f7f9'><div style='max-width:600px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden'><div style='padding:30px;text-align:center'><h1 style='margin:0;color:#255d3a;font-size:30px'>Saka Krib</h1><p style='margin:8px 0 0;color:#777;font-size:14px'>{escape(tagline)}</p></div>{body}<div style='padding:25px;text-align:center;background:#1e1e1e;color:#aaa;font-size:12px'><strong style='color:#fff;font-size:14px'>Saka Krib</strong><p style='margin:10px 0'>{escape(tagline)}</p><p style='margin:10px 0'><a href='mailto:{SUPPORT_EMAIL}' style='color:#7fcf9a;text-decoration:none'>{SUPPORT_EMAIL}</a></p><hr style='border:none;border-top:1px solid #444;margin:18px 0'><p style='margin:0;color:#888'>© 2026 Saka Krib. All rights reserved.</p></div></div></div></body></html>"""


def _status_panel(heading: str, message: str, background: str = "#f1f7f3") -> str:
    return f"<div style='padding:32px 25px;text-align:center;background:{background};border-top:1px solid #dfeae2;border-bottom:1px solid #dfeae2'><h2 style='margin:0 0 10px;color:#255d3a;font-size:24px'>{escape(heading)}</h2><p style='margin:0;color:#555;font-size:14px;line-height:1.6'>{escape(message)}</p></div>"


def _details(rows: list[tuple[str, Any]]) -> str:
    html = "<div style='margin:25px 30px;padding:20px;background:#f5f7f6;border-radius:12px'><p style='margin:0 0 12px;color:#777;font-size:13px'>APPLICATION DETAILS</p><table width='100%' cellpadding='0' cellspacing='0' style='border-collapse:collapse'>"
    for label, value in rows:
        if value in (None, ""):
            continue
        html += f"<tr><td style='padding:7px 0;color:#777;font-size:14px'>{escape(str(label))}</td><td style='padding:7px 0;text-align:right;font-weight:bold;font-size:14px;word-break:break-word'>{escape(str(value))}</td></tr>"
    return html + "</table></div>"


def application_approved(application: dict) -> str:
    raw = _text(application.get("application_type")).lower()
    role = "Real Estate" if raw in {"realestate", "real_estate"} else raw.title() if raw else "Professional"
    name = _first_name(application)
    body = _status_panel("Application Approved", f"Congratulations! Your {role.lower()} application has been approved.", "#e8f5e9")
    body += f"<div style='padding:30px'><p>Hello {escape(name)},</p><p style='line-height:1.7;color:#444'>We are pleased to let you know that your <strong>{escape(role)}</strong> application on Saka Krib has been reviewed and approved.</p>"
    body += _details([("Applicant", _text(application.get("applicant_name")) or _text(application.get("full_name"))), ("Application Type", role), ("Status", "Approved"), ("Application ID", application.get("application_id") or application.get("id"))])
    body += f"<div style='text-align:center;margin:30px 0'><a href='{escape(_text(application.get('dashboard_url'), SITE_URL))}' style='display:inline-block;padding:14px 28px;background:#255d3a;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold'>Open Saka Krib</a></div></div>"
    return _layout("Application Approved", body)


def application_declined(application: dict) -> str:
    raw = _text(application.get("application_type")).lower()
    role = "Real Estate" if raw in {"realestate", "real_estate"} else raw.title() if raw else "Professional"
    name = _first_name(application)
    reason = _text(application.get("admin_review_note")) or _text(application.get("decline_reason")) or _text(application.get("review_notes"))
    body = _status_panel("Application Update", f"We have completed the review of your {role.lower()} application.", "#fff3f3")
    body += f"<div style='padding:30px'><p>Hello {escape(name)},</p><p style='line-height:1.7;color:#444'>Unfortunately, after reviewing the information and documents provided, your application was not approved at this time.</p>"
    body += _details([("Application Type", role), ("Status", "Not Approved"), ("Application ID", application.get("application_id") or application.get("id"))])
    if reason:
        body += f"<div style='margin:25px 0;padding:18px;background:#fff8f8;border-left:4px solid #b42318;border-radius:8px'><strong>Reason for this decision</strong><p style='white-space:pre-line;line-height:1.7'>{escape(reason)}</p></div>"
    body += f"<p style='line-height:1.7'>Need clarification? Contact <a href='mailto:{SUPPORT_EMAIL}'>{SUPPORT_EMAIL}</a>.</p></div>"
    return _layout("Application Update", body)


def application_review(application: dict) -> str:
    raw = _text(application.get("application_type")).lower()
    role = "Real Estate" if raw in {"realestate", "real_estate"} else raw.title() if raw else "Mover"
    name = _first_name(application)
    body = _status_panel("Application Under Review", f"Our team is currently reviewing your {role.lower()} application.", "#fff8e6")
    body += f"<div style='padding:30px'><p>Hello {escape(name)},</p><p style='line-height:1.7;color:#444'>Your application to become a <strong>{escape(role)}</strong> on Saka Krib is currently being reviewed. We will email you when a decision is made.</p>"
    body += _details([("Application Type", role), ("Status", "Under Review"), ("Application ID", application.get("application_id") or application.get("id")), ("Operating City", application.get("operating_city"))])
    body += "<p style='line-height:1.7'><strong>Please do not submit another application.</strong> Your current application is already being reviewed.</p></div>"
    return _layout("Your Application Is Under Review", body)


def landlord_application_submitted(application: dict) -> str:
    kind = "Real Estate" if _text(application.get("application_type")).lower() == "realestate" else "Landlord"
    name = _first_name(application)
    body = _status_panel("Application Submitted", f"Your {kind.lower()} application has been successfully submitted.", "#e8f5e9")
    body += f"<div style='padding:30px'><p>Hello {escape(name)},</p><p style='line-height:1.7;color:#444'>Thank you for applying to become a <strong>{kind.lower()}</strong> on Saka Krib. Your application has been received and is awaiting administrator review.</p>"
    body += _details([("Applicant", application.get("applicant_name") or application.get("full_name")), ("Application Type", kind), ("Status", "Pending Review"), ("Application ID", application.get("application_id") or application.get("id")), ("Submitted", application.get("submitted_at") or "Just now")])
    body += "<p style='line-height:1.7'>You do not need to submit another application while this application is under review.</p></div>"
    return _layout(f"{kind} Application Submitted", body)


def mover_application_submitted(application: dict) -> str:
    name = _first_name(application)
    body = _status_panel("Application Submitted", "Your mover application has been successfully submitted and is now awaiting review.", "#e8f5e9")
    body += f"<div style='padding:30px'><p>Hello {escape(name)},</p><p style='line-height:1.7;color:#444'>Thank you for applying to become a <strong>mover</strong> on Saka Krib. We have successfully received your application.</p>"
    body += _details([("Application", "Mover Registration"), ("Status", "Pending Review"), ("Vehicle Type", application.get("vehicle_type")), ("Operating City", application.get("operating_city")), ("County", application.get("operating_county")), ("Application ID", application.get("application_id") or application.get("id"))])
    body += "<p style='line-height:1.7'>Our team will review the information and documents you provided and notify you when the review is complete.</p></div>"
    return _layout("Mover Application Submitted", body, "Moving made easier")


def landlord_admin_notification(application: dict) -> str:
    body = _status_panel("New Landlord Application", "A new landlord application requires administrator review.", "#fff8e1")
    body += "<div style='padding:30px'><h3>Application Summary</h3>"
    body += _details([("Applicant", application.get("applicant_name") or application.get("full_name") or "Unknown applicant"), ("Email", application.get("applicant_email") or application.get("email") or "Not provided"), ("Phone", application.get("phone") or "Not provided"), ("National ID", application.get("national_id") or "Not provided"), ("Document Type", application.get("document_type") or "Not provided"), ("Application ID", application.get("application_id") or application.get("id"))])
    body += f"<div style='text-align:center;margin:30px 0'><a href='{SITE_URL}/admin' style='display:inline-block;padding:14px 28px;background:#255d3a;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold'>Review Application</a></div></div>"
    return _layout("New Landlord Application", body, "Administration Notification")


def mover_admin_notification(application: dict) -> str:
    body = _status_panel("New Mover Application", "A new mover application requires administrator review.", "#fff8e1")
    body += "<div style='padding:30px'><h3>Application Summary</h3>"
    body += _details([("Applicant", application.get("applicant_name") or application.get("driver_full_name") or "Unknown applicant"), ("Email", application.get("applicant_email") or application.get("email") or "Not provided"), ("Phone", application.get("phone") or "Not provided"), ("Vehicle Type", application.get("vehicle_type") or "Not provided"), ("Number Plate", application.get("number_plate") or "Not provided"), ("Operating City", application.get("operating_city") or "Not provided"), ("County", application.get("operating_county") or "Not provided"), ("Application ID", application.get("application_id") or application.get("id"))])
    body += f"<div style='text-align:center;margin:30px 0'><a href='{SITE_URL}/admin' style='display:inline-block;padding:14px 28px;background:#255d3a;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold'>Review Application</a></div></div>"
    return _layout("New Mover Application", body, "Administration Notification")


def otp_verification(application: dict) -> str:
    first = _first_name(application)
    otp = _text(application.get("otp") or application.get("verification_code") or application.get("code"))
    purpose = _text(application.get("purpose"), "verify your account")
    body = _status_panel("Verification Code", f"Use the code below to {purpose}.")
    body += f"<div style='padding:30px'><p>Hello {escape(first)},</p><p>Enter the verification code below to continue.</p><div style='margin:30px 0;padding:24px;text-align:center;background:#f5f7f6;border:1px solid #e1e7e3;border-radius:12px'><div style='font-size:32px;font-weight:bold;letter-spacing:8px;color:#255d3a'>{escape(otp)}</div></div><div style='padding:18px;background:#fff8e8;border:1px solid #f1e3bd;border-radius:10px'>Keep your verification code private. This code expires shortly. Never share it with anyone.</div></div>"
    return _layout("Saka Krib Verification Code", body, "Account verification")


def sign_in_notification(user: dict) -> str:
    body = _status_panel("Successful Sign In", "Your Saka Krib account was successfully accessed.", "#eef6ff")
    body += f"<div style='padding:30px'><p>Hello {escape(_first_name(user))},</p><p>We detected a successful sign in to your Saka Krib account.</p>"
    body += _details([("Account", user.get("email")), ("Date & Time", user.get("sign_in_time")), ("Device", user.get("device")), ("Location", user.get("location"))])
    body += "<div style='padding:18px;background:#fff8e6;border:1px solid #f1e3bd;border-radius:10px'>If you did not sign in to your account, please review your account security and contact support.</div></div>"
    return _layout("New Sign In to Your Saka Krib Account", body, "Account Security Notification")


def sign_up_welcome(user: dict) -> str:
    body = _status_panel("Welcome to Saka Krib", "Your account has been successfully created.", "#e8f5e9")
    body += f"<div style='padding:30px'><p>Hello {escape(_first_name(user))},</p><p style='line-height:1.7;color:#444'>Welcome to Saka Krib. Your account has been successfully created and you can now start using the platform.</p>"
    body += _details([("Name", user.get("full_name")), ("Email", user.get("email"))])
    url = _text(user.get("dashboard_url"), SITE_URL)
    body += f"<div style='text-align:center;margin:30px 0'><a href='{escape(url)}' style='display:inline-block;padding:14px 30px;background:#255d3a;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold'>Open Saka Krib</a></div></div>"
    return _layout("Welcome to Saka Krib", body)


EMAIL_TEMPLATES = {
    "application_approved": application_approved,
    "application_declined": application_declined,
    "application_review": application_review,
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
    "landlord_application_submitted": "Landlord application submitted - Saka Krib",
    "mover_application_submitted": "Mover application submitted - Saka Krib",
    "landlord_admin_notification": "New landlord application requires review - Saka Krib",
    "mover_admin_notification": "New mover application requires review - Saka Krib",
    "otp_verification": "Your Saka Krib verification code",
    "sign_in_notification": "New sign-in to your Saka Krib account",
    "sign_up_welcome": "Welcome to Saka Krib",
}
