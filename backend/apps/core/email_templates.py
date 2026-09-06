from datetime import datetime
from html import escape
from typing import Any


SITE_URL = "https://sakakrib.com"
SUPPORT_EMAIL = "support@sakakrib.com"


def _text(value: Any, default: str = "") -> str:
    value = "" if value is None else str(value).strip()
    return value or default


def _first_name(application: dict) -> str:
    applicant = application.get("applicant") or {}
    user = application.get("user") or {}
    name = (_text(application.get("full_name")) or _text(application.get("applicant_name")) or
            _text(application.get("driver_full_name")) or _text(applicant.get("full_name")) or
            _text(user.get("full_name")) or "")
    return name.split()[0] if name else "there"


def _safe_url(value: Any, default: str = SITE_URL) -> str:
    value = _text(value, default)
    if not value.lower().startswith(("http://", "https://")):
        value = default
    return escape(value, quote=True)


def _layout(title: str, body: str, tagline: str = "Moving, renting and property services made easier.") -> str:
    year = datetime.now().year
    return f'''<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>{escape(title)}</title></head>
<body style="margin:0;padding:0;background:#f6f7f9;color:#222;font-family:Arial,Helvetica,sans-serif;">
<div style="width:100%;padding:30px 15px;background:#f6f7f9;box-sizing:border-box;"><div style="width:100%;max-width:600px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;">
<div style="padding:30px;text-align:center;"><h1 style="margin:0;color:#255d3a;font-size:30px;">Saka Krib</h1><p style="margin:8px 0 0;color:#777;font-size:14px;">{escape(tagline)}</p></div>
{body}
<div style="padding:25px;text-align:center;background:#1e1e1e;color:#aaa;font-size:12px;"><strong style="color:#fff;font-size:14px;">Saka Krib</strong><p style="margin:10px 0;line-height:1.6;">{escape(tagline)}</p><p style="margin:10px 0;"><a href="mailto:{SUPPORT_EMAIL}" style="color:#7fcf9a;text-decoration:none;">{SUPPORT_EMAIL}</a></p><hr style="border:none;border-top:1px solid #444;margin:18px 0;"><p style="margin:0;color:#888;">© {year} Saka Krib. All rights reserved.</p></div>
</div></div></body></html>'''


def _status_panel(heading: str, message: str, background: str, border: str, heading_color: str = "#255d3a", message_color: str = "#4b6350", icon: str = "", icon_background: str = "#c8e6c9", icon_color: str = "#1b5e20", icon_size: int = 30) -> str:
    icon_html = ""
    if icon:
        icon_html = f'''<div style="width:58px;height:58px;margin:0 auto 15px;border-radius:50%;background:{icon_background};line-height:58px;font-size:{icon_size}px;font-weight:bold;color:{icon_color};">{icon}</div>'''
    return f'''<div style="padding:32px 25px;text-align:center;background:{background};border-top:1px solid {border};border-bottom:1px solid {border};">{icon_html}<h2 style="margin:0 0 10px;color:{heading_color};font-size:24px;">{escape(heading)}</h2><p style="margin:0;color:{message_color};font-size:14px;line-height:1.6;">{escape(message)}</p></div>'''


def _admin_alert(heading: str, message: str, icon: str) -> str:
    return f'''<div style="padding:28px 25px;text-align:center;background:#fff8e1;border-top:1px solid #f3e5ab;border-bottom:1px solid #f3e5ab;"><div style="font-size:38px;line-height:1;">{icon}</div><h2 style="margin:12px 0 8px;color:#7a5600;font-size:23px;">{escape(heading)}</h2><p style="margin:0;color:#806c3c;font-size:14px;line-height:1.6;">{escape(message)}</p></div>'''


def _details(rows: list[tuple[str, Any]], heading: str = "APPLICATION DETAILS", bordered: bool = False, row_padding: int = 7, heading_letter_spacing: str = "0") -> str:
    wrapper_style = "border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;" if bordered else ""
    container_style = "margin:25px 0;padding:20px;background:#f5f7f6;border-radius:12px;" if not bordered else ""
    heading_style = f"margin:0 0 12px;color:#777;font-size:13px;letter-spacing:{heading_letter_spacing};"
    html = f'<div style="{container_style}{wrapper_style}"><p style="{heading_style}">{escape(heading)}</p><table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">'
    items = [(label, value) for label, value in rows if value not in (None, "")]
    for index, (label, value) in enumerate(items):
        last = index == len(items) - 1
        border_bottom = "" if (last and bordered) else "border-bottom:1px solid #eeeeee;" if bordered else ""
        status_color = ""
        if str(label).lower() == "status":
            normalized = str(value).lower()
            if "approved" in normalized and "not" not in normalized: status_color = "color:#1b5e20;"
            elif "not approved" in normalized: status_color = "color:#b42318;"
            elif "pending" in normalized or "review" in normalized: status_color = "color:#9a6700;"
        label_style = f"padding:{row_padding}px{' ' + str(row_padding) + 'px' if bordered else ' 0'};color:#777;font-size:{13 if bordered else 14}px;{border_bottom}"
        value_style = f"padding:{row_padding}px{' ' + str(row_padding) + 'px' if bordered else ' 0'};text-align:right;font-size:{13 if bordered else 14}px;font-weight:bold;word-break:break-word;{border_bottom}{status_color}"
        html += f'<tr><td style="{label_style}">{escape(str(label))}</td><td style="{value_style}">{escape(str(value))}</td></tr>'
    return html + "</table></div>"


def _body(content: str) -> str:
    return f'<div style="padding:30px;">{content}</div>'


def _button(url: Any, label: str, padding: str = "14px 28px") -> str:
    return f'''<div style="text-align:center;margin:30px 0 10px;"><a href="{_safe_url(url)}" style="display:inline-block;padding:{padding};background:#255d3a;color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:bold;">{escape(label)}</a></div>'''


def moving_started(data: dict) -> str:
    first_name = _first_name(data)
    tracking_number = _text(data.get("tracking_number"), "N/A")
    booking_id = _text(data.get("booking_id"), "N/A")
    started_at = _text(data.get("started_at"), "N/A")
    tracking_url = data.get("tracking_url") or SITE_URL
    body = _status_panel("Your move has started", "Your assigned mover has started the journey. You can now follow the move using your tracking number.", "#e8f5e9", "#c8e6c9", heading_color="#1b5e20", message_color="#4b6350", icon="✓", icon_background="#c8e6c9", icon_color="#1b5e20")
    content = f'''<p style="margin:0 0 16px;font-size:15px;line-height:1.7;">Hello {escape(first_name)},</p><p style="margin:0 0 18px;color:#444;font-size:15px;line-height:1.7;">Your mover has started the journey. Saka Krib is now recording the active moving journey so you can follow its progress.</p>{_details([('Booking', booking_id), ('Tracking number', tracking_number), ('Journey started', started_at)], heading="JOURNEY DETAILS")}{_button(tracking_url, 'Open Saka Krib', '14px 30px')}<p style="margin:0;color:#777;font-size:13px;line-height:1.6;">Keep your tracking number for reference. If you have questions about this move, use your Saka Krib conversation with the mover or contact support.</p>'''
    return _layout("Your move has started", body + _body(content))


# The application email templates remain in their existing module history. This
# registry is intentionally completed below by importing the existing functions
# from the preserved legacy module when available.
try:
    from .email_templates_legacy import *  # type: ignore
except ImportError:
    pass

EMAIL_TEMPLATES = {"moving_started": moving_started}
EMAIL_SUBJECTS = {"moving_started": "Your Saka Krib move has started"}
