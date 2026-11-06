from html import escape
from typing import Any

from .email_templates import (
    SITE_URL,
    _body,
    _button,
    _details,
    _first_name,
    _layout,
    _status_panel,
    _text,
)


def _subscription_name(data: dict[str, Any]) -> str:
    return _text(data.get("plan_name"), "Saka Krib subscription")


def _billing_cycle(data: dict[str, Any]) -> str:
    cycle = _text(data.get("billing_cycle"), "").upper()
    return "Annual" if cycle == "ANNUAL" else "Monthly" if cycle == "MONTHLY" else cycle.title() or "N/A"


def _amount_kes(data: dict[str, Any]) -> str:
    value = data.get("amount_kes")
    if value in (None, ""):
        return "N/A"
    try:
        return f"KES {float(value):,.2f}"
    except (TypeError, ValueError):
        return f"KES {_text(value)}"


def _amount_usd(data: dict[str, Any]) -> str:
    value = data.get("amount_usd")
    if value in (None, ""):
        return "N/A"
    try:
        return f"USD {float(value):,.2f}"
    except (TypeError, ValueError):
        return f"USD {_text(value)}"


def _payment_details(data: dict[str, Any], status: str, include_upgrade: bool = False) -> str:
    rows = [
        ("Plan", _subscription_name(data)),
        ("Billing Cycle", _billing_cycle(data)),
        ("Amount (KES)", _amount_kes(data)),
        ("Amount (USD)", _amount_usd(data)),
        ("Payment Provider", _text(data.get("provider"), "N/A").upper()),
        ("Payment Reference", _text(data.get("provider_reference")) or _text(data.get("provider_transaction_id")) or "N/A"),
        ("Invoice ID", _text(data.get("invoice_id"), "N/A")),
        ("Billing Period", _text(data.get("billing_period"), "N/A")),
        ("Status", status),
    ]
    if include_upgrade:
        rows.insert(1, ("Previous Plan", _text(data.get("current_plan_name"), "N/A")))
        rows.insert(2, ("New Plan", _text(data.get("target_plan_name"), _subscription_name(data))))
    return _details(rows, heading="SUBSCRIPTION DETAILS")


def subscription_payment_confirmed(data: dict[str, Any]) -> str:
    first = _first_name(data)
    renewal = bool(data.get("renewal")) or str(data.get("event_type") or "").upper().find("RENEW") >= 0
    title = "Subscription renewal confirmed" if renewal else "Subscription payment confirmed"
    message = (
        "Your Saka Krib subscription renewal has been successfully received and your subscription period has been updated."
        if renewal
        else "Your Saka Krib subscription payment has been successfully received and your subscription is now active."
    )
    body = _status_panel(title, message, "#e8f5e9", "#c8e6c9", heading_color="#1b5e20", message_color="#4b6350", icon="✓", icon_background="#c8e6c9", icon_color="#1b5e20")
    period = _text(data.get("billing_period"))
    if not period:
        start = _text(data.get("billing_period_start"))
        end = _text(data.get("billing_period_end"))
        if start or end:
            period = f"{start or 'N/A'} – {end or 'N/A'}"
    data = {**data, "billing_period": period}
    content = f'''<p style="margin:0 0 16px;font-size:15px;line-height:1.7;">Hello {escape(first)},</p><p style="margin:0 0 18px;color:#444444;font-size:15px;line-height:1.7;">{escape(message)}</p>{_payment_details(data, "Paid")}<div style="margin:25px 0;padding:20px;border:1px solid #d9e8dc;border-radius:12px;background:#f8fbf9;"><h3 style="margin:0 0 12px;font-size:16px;color:#222222;">Your access is active</h3><p style="margin:0;color:#555555;font-size:14px;line-height:1.7;">Your subscription benefits and property-management access continue according to the plan shown above. Your payment record has been retained in Saka Krib for your records.</p></div>{_button(data.get("dashboard_url") or f"{SITE_URL}/#pms-dashboard", "Open Saka Krib", "14px 30px")}<p style="margin:0;color:#777777;font-size:13px;line-height:1.6;">Thank you for choosing Saka Krib.</p>'''
    return _layout(title, body + _body(content))


def subscription_upgraded(data: dict[str, Any]) -> str:
    first = _first_name(data)
    target = _text(data.get("target_plan_name"), "your new plan")
    title = "Subscription upgraded"
    body = _status_panel("Subscription Upgraded", f"Your Saka Krib subscription has been upgraded to {target}.", "#e8f5e9", "#c8e6c9", heading_color="#1b5e20", message_color="#4b6350", icon="✓", icon_background="#c8e6c9", icon_color="#1b5e20")
    content = f'''<p style="margin:0 0 16px;font-size:15px;line-height:1.7;">Hello {escape(first)},</p><p style="margin:0 0 18px;color:#444444;font-size:15px;line-height:1.7;">Your subscription upgrade has been confirmed. Your account is now using the updated plan and its associated property-management limits.</p>{_payment_details(data, "Upgraded", include_upgrade=True)}<div style="margin:25px 0;padding:20px;border:1px solid #d9e8dc;border-radius:12px;background:#f8fbf9;"><h3 style="margin:0 0 12px;font-size:16px;color:#222222;">What this means</h3><p style="margin:0;color:#555555;font-size:14px;line-height:1.7;">Your Saka Krib property-management access now follows the upgraded plan. Existing PMS listing relationships remain attached to your subscription.</p></div>{_button(data.get("dashboard_url") or f"{SITE_URL}/#subscription-plans", "Open Saka Krib", "14px 30px")}'''
    return _layout(title, body + _body(content))


def subscription_payment_failed(data: dict[str, Any]) -> str:
    first = _first_name(data)
    reason = _text(data.get("failure_reason")) or _text(data.get("message")) or "The payment provider did not confirm the subscription payment."
    body = _status_panel("Subscription Payment Failed", "We could not confirm your subscription payment.", "#fff3f3", "#f3d2d2", heading_color="#b42318", message_color="#6b4a4a", icon="!", icon_background="#fde8e8", icon_color="#b42318", icon_size=28)
    content = f'''<p style="margin:0 0 16px;font-size:15px;line-height:1.7;">Hello {escape(first)},</p><p style="margin:0 0 18px;color:#444444;font-size:15px;line-height:1.7;">Your subscription payment was not completed successfully. No subscription access is granted from this failed payment.</p>{_payment_details(data, "Payment Failed")}<div style="margin:25px 0;padding:20px;background:#fff8f8;border:1px solid #f1d1d1;border-left:4px solid #b42318;border-radius:8px;"><p style="margin:0 0 8px;font-size:14px;font-weight:bold;color:#8f1d16;">Payment information</p><p style="margin:0;color:#555555;font-size:14px;line-height:1.7;">{escape(reason)}</p></div><div style="margin:25px 0;padding:20px;border:1px solid #e5e7eb;border-radius:12px;"><h3 style="margin:0 0 12px;font-size:16px;color:#222222;">What to do next</h3><p style="margin:0;color:#555555;font-size:14px;line-height:1.7;">Please return to Saka Krib and retry the payment using an available payment method. If you believe you were charged despite this message, keep your provider reference and contact support.</p></div>{_button(data.get("dashboard_url") or f"{SITE_URL}/#subscription-plans", "Review Subscription", "14px 30px")}'''
    return _layout("Subscription Payment Failed", body + _body(content))


def subscription_grace_period(data: dict[str, Any]) -> str:
    first = _first_name(data)
    grace_end = _text(data.get("grace_period_end"), "the end of the grace period")
    body = _status_panel("Subscription in Grace Period", f"Your subscription has entered its grace period. Please renew before {grace_end} to keep your property-management access active.", "#fff8e6", "#f3e5ab", heading_color="#7a5200", message_color="#735f35", icon="⏳", icon_background="#fff0c2", icon_color="#9a6700", icon_size=28)
    content = f'''<p style="margin:0 0 16px;font-size:15px;line-height:1.7;">Hello {escape(first)},</p><p style="margin:0 0 18px;color:#444444;font-size:15px;line-height:1.7;">Your paid subscription period has ended and Saka Krib has placed the subscription in a temporary grace period. Your account has a limited window to renew before access is restricted.</p>{_payment_details(data, "Grace Period")}<div style="margin:25px 0;padding:20px;background:#fff8e6;border:1px solid #f1e3bd;border-radius:10px;color:#735f35;font-size:14px;line-height:1.7;"><strong>Renewal deadline:</strong> {escape(grace_end)}<br><br>Renewing during the grace period restores the subscription without creating a second subscription record.</div>{_button(data.get("renewal_url") or f"{SITE_URL}/#subscription-plans", "Renew Subscription", "14px 30px")}<p style="margin:0;color:#777777;font-size:13px;line-height:1.6;">If you have already completed a renewal payment, allow the payment provider confirmation to update your subscription before starting another payment.</p>'''
    return _layout("Subscription Grace Period", body + _body(content))


def subscription_expired(data: dict[str, Any]) -> str:
    first = _first_name(data)
    body = _status_panel("Subscription Expired", "Your Saka Krib subscription has expired and property-management access is no longer active.", "#fff3f3", "#f3d2d2", heading_color="#b42318", message_color="#6b4a4a", icon="!", icon_background="#fde8e8", icon_color="#b42318", icon_size=28)
    content = f'''<p style="margin:0 0 16px;font-size:15px;line-height:1.7;">Hello {escape(first)},</p><p style="margin:0 0 18px;color:#444444;font-size:15px;line-height:1.7;">Your subscription reached the end of its grace period without a confirmed renewal payment. Saka Krib has therefore marked it as expired.</p>{_payment_details(data, "Expired")}<div style="margin:25px 0;padding:20px;border:1px solid #e5e7eb;border-radius:12px;"><h3 style="margin:0 0 12px;font-size:16px;color:#222222;">Restore property-management access</h3><p style="margin:0;color:#555555;font-size:14px;line-height:1.7;">You can return to Saka Krib and start a new subscription checkout when you are ready. Your previous invoice and payment history remain preserved.</p></div>{_button(data.get("dashboard_url") or f"{SITE_URL}/#subscription-plans", "Manage Subscription", "14px 30px")}'''
    return _layout("Subscription Expired", body + _body(content))


def subscription_cancelled(data: dict[str, Any]) -> str:
    first = _first_name(data)
    body = _status_panel("Subscription Cancelled", "Your Saka Krib subscription has been cancelled.", "#f4f4f5", "#e4e4e7", heading_color="#3f3f46", message_color="#5f6368", icon="✓", icon_background="#e4e4e7", icon_color="#3f3f46", icon_size=26)
    content = f'''<p style="margin:0 0 16px;font-size:15px;line-height:1.7;">Hello {escape(first)},</p><p style="margin:0 0 18px;color:#444444;font-size:15px;line-height:1.7;">Your Saka Krib subscription has been cancelled. Your payment history and previous invoices remain preserved in Saka Krib.</p>{_payment_details(data, "Cancelled")}<div style="margin:25px 0;padding:20px;border:1px solid #e5e7eb;border-radius:12px;"><h3 style="margin:0 0 12px;font-size:16px;color:#222222;">Need Saka Krib again?</h3><p style="margin:0;color:#555555;font-size:14px;line-height:1.7;">When you are ready to use property-management services again, you can start a new subscription checkout from your account.</p></div>{_button(data.get("dashboard_url") or SITE_URL, "Open Saka Krib", "14px 30px")}'''
    return _layout("Subscription Cancelled", body + _body(content))


SUBSCRIPTION_EMAIL_TEMPLATES = {
    "subscription_payment_confirmed": subscription_payment_confirmed,
    "subscription_upgraded": subscription_upgraded,
    "subscription_payment_failed": subscription_payment_failed,
    "subscription_grace_period": subscription_grace_period,
    "subscription_expired": subscription_expired,
    "subscription_cancelled": subscription_cancelled,
}

SUBSCRIPTION_EMAIL_SUBJECTS = {
    "subscription_payment_confirmed": "Subscription payment confirmed - Saka Krib",
    "subscription_upgraded": "Subscription upgraded - Saka Krib",
    "subscription_payment_failed": "Subscription payment failed - Saka Krib",
    "subscription_grace_period": "Subscription grace period - Saka Krib",
    "subscription_expired": "Subscription expired - Saka Krib",
    "subscription_cancelled": "Subscription cancelled - Saka Krib",
}
