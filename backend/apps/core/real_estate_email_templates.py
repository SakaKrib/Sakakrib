from html import escape

from .email_templates import _admin_alert, _body, _details, _first_name, _layout, _status_panel, _text


def real_estate_application_submitted(application: dict) -> str:
    first = _first_name(application)
    submitted_at = _text(application.get("submitted_at"), "Just now")
    application_id = application.get("application_id") or application.get("id")
    body = _status_panel(
        "Application Submitted",
        "Your real estate application has been successfully submitted and is now awaiting administrator review.",
        "#e8f5e9",
        "#c8e6c9",
        heading_color="#1b5e20",
        message_color="#4b6350",
        icon="✓",
        icon_background="#c8e6c9",
        icon_color="#1b5e20",
    )
    content = f'''<p style="margin:0 0 16px;font-size:15px;line-height:1.7;">Hello {escape(first)},</p><p style="margin:0 0 16px;color:#444444;font-size:15px;line-height:1.7;">Thank you for applying to become a <strong>real estate professional</strong> on Saka Krib. Your application has been received successfully and is now awaiting administrator review.</p>{_details([('Applicant', application.get('applicant_name') or application.get('full_name')), ('Application Type', 'Real Estate'), ('Status', 'Pending Review'), ('Application ID', application_id), ('Submitted', submitted_at)])}<div style="margin:25px 0;padding:20px;border:1px solid #e5e7eb;border-radius:12px;"><h3 style="margin:0 0 12px;font-size:16px;color:#222222;">What happens next?</h3><p style="margin:0;color:#555555;font-size:14px;line-height:1.7;">Our administration team will review the information and identity document you provided. Once the review is complete, you will receive another email informing you whether your application has been approved or declined.</p></div><p style="margin:25px 0 0;color:#555555;font-size:14px;line-height:1.7;">You do not need to submit another application while this application is under review.</p><p style="margin:20px 0 0;color:#555555;font-size:14px;line-height:1.7;">Thank you for choosing Saka Krib.</p>'''
    return _layout("Real Estate Application Submitted", body + _body(content))


def real_estate_admin_notification(application: dict) -> str:
    applicant_name = _text(application.get("applicant_name")) or _text(application.get("full_name"), "Unknown applicant")
    applicant_email = _text(application.get("applicant_email")) or _text(application.get("email"), "Not provided")
    phone = _text(application.get("phone"), "Not provided")
    national_id = _text(application.get("national_id"), "Not provided")
    document_type = _text(application.get("document_type"), "Not provided")
    application_id = application.get("application_id") or application.get("id") or "Pending assignment"
    submitted_at = _text(application.get("submitted_at"), "Just now")
    body = _admin_alert(
        "New Real Estate Application",
        "A new real estate application has been submitted and requires administrator review.",
        "🏢",
    )
    content = f'''<h3 style="margin:0 0 18px;font-size:18px;color:#222222;">Application Summary</h3>{_details([('Applicant', applicant_name), ('Email', applicant_email), ('Phone', phone), ('National ID', national_id), ('Document Type', document_type)], bordered=True, row_padding=13)}<div style="margin-top:22px;padding:18px;background:#f5f7f6;border-radius:10px;"><div style="font-size:12px;color:#777777;">Application Type</div><div style="margin-top:5px;font-size:16px;font-weight:bold;color:#255d3a;">Real Estate</div></div><div style="margin-top:12px;padding:18px;background:#f5f7f6;border-radius:10px;"><div style="font-size:12px;color:#777777;">Application Status</div><div style="margin-top:5px;font-size:16px;font-weight:bold;color:#b26a00;">Pending Review</div></div><div style="margin-top:18px;font-size:12px;color:#777777;line-height:1.7;"><strong>Application ID:</strong> {escape(_text(application_id))}<br><strong>Submitted:</strong> {escape(submitted_at)}</div><div style="margin-top:25px;padding:18px;background:#f8faf9;border-left:4px solid #255d3a;border-radius:6px;color:#526158;font-size:13px;line-height:1.6;"><strong>Administrator action required</strong><br><br>Please review the applicant's identity information and uploaded document before approving or declining the real estate application.</div>'''
    return _layout("New Real Estate Application", body + '<div style="padding:30px 25px;">' + content + '</div>', "Administration Notification")
