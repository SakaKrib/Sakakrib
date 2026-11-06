"""CSV / PDF exports for landlord and real-estate property management.

GET /api/core/pms/export/?kind=invoices|payments|tenants|units&format=csv|pdf
Works for the subscribing owner and for active real-estate PMS team members (who export the
owner's portfolio). Read-only grace-period accounts can still export their records.
"""
import csv
import io
from datetime import date

from django.http import HttpResponse
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.authorization import pms_access
from apps.accounts.models import Profile
from apps.listings.models import Listing

from .domain_property import PropertyUnit, RenterUnitAssociation
from .domain_rent import RentInvoice, RentInvoicePeriod

MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _owner_id(user):
    if user.role in {"landlord", "real_estate"}:
        return user.id
    from apps.listings.services import _real_estate_pms_owner
    owner = _real_estate_pms_owner(user)
    return owner.id if owner else None


def _property_names(listing_ids):
    return {str(x.id): (x.property_name or x.title) for x in Listing.objects.filter(id__in=list(listing_ids))}


def _money(value):
    return f"{float(value or 0):.2f}"


def _build(kind, owner_id):
    if kind == "invoices":
        rows = list(RentInvoice.objects.filter(landlord_id=owner_id).order_by("-due_date"))
        names = _property_names({r.listing_id for r in rows})
        units = {str(u.id): u.unit_number for u in PropertyUnit.objects.filter(id__in=[r.unit_id for r in rows])}
        renters = {str(p.id): p.full_name for p in Profile.objects.filter(id__in=[r.renter_user_id for r in rows])}
        periods = {}
        for p in RentInvoicePeriod.objects.filter(invoice_id__in=[r.id for r in rows]).order_by("period_year", "period_month"):
            periods.setdefault(str(p.invoice_id), []).append(f"{MONTHS[p.period_month - 1]} {p.period_year}")
        header = ["Invoice", "Property", "Unit", "Renter", "Rent for", "Due date", "Amount (KES)", "Status", "Raised by", "Method", "Transaction ID", "Paid on"]
        body = [[
            r.invoice_number, names.get(str(r.listing_id), ""), units.get(str(r.unit_id), ""), renters.get(str(r.renter_user_id), ""),
            ", ".join(periods.get(str(r.id), [])), r.due_date, _money(r.amount_kes), r.status,
            "Landlord" if r.payment_destination_snapshot else "Renter", r.payment_method or "", r.transaction_reference or "",
            r.paid_at.date() if r.paid_at else (r.payment_date or ""),
        ] for r in rows]
        return "Rent invoices", header, body
    if kind == "payments":
        rows = list(RentInvoice.objects.filter(landlord_id=owner_id, status="PAID").order_by("-paid_at"))
        names = _property_names({r.listing_id for r in rows})
        units = {str(u.id): u.unit_number for u in PropertyUnit.objects.filter(id__in=[r.unit_id for r in rows])}
        renters = {str(p.id): p.full_name for p in Profile.objects.filter(id__in=[r.renter_user_id for r in rows])}
        header = ["Paid on", "Property", "Unit", "Renter", "Invoice", "Amount (KES)", "Method", "Transaction ID"]
        body = [[r.paid_at.date() if r.paid_at else "", names.get(str(r.listing_id), ""), units.get(str(r.unit_id), ""),
                 renters.get(str(r.renter_user_id), ""), r.invoice_number, _money(r.amount_kes), r.payment_method or "", r.transaction_reference or ""] for r in rows]
        body.append(["TOTAL", "", "", "", "", _money(sum(float(r.amount_kes or 0) for r in rows)), "", ""])
        return "Rent collected", header, body
    if kind == "tenants":
        rows = list(RenterUnitAssociation.objects.filter(landlord_id=owner_id).order_by("-created_at"))
        units = {str(u.id): u for u in PropertyUnit.objects.filter(id__in=[r.unit_id for r in rows])}
        names = _property_names({u.listing_id for u in units.values()})
        header = ["Tenant", "Phone", "Email", "Property", "Unit", "Rent (KES)", "Lease start", "Lease end", "Status"]
        body = []
        for r in rows:
            u = units.get(str(r.unit_id))
            body.append([r.renter_name, r.renter_phone or "", r.renter_email or "", names.get(str(u.listing_id), "") if u else "",
                         u.unit_number if u else "", _money(r.rent_amount), r.lease_start or "", r.lease_end or "", r.status])
        return "Tenants", header, body
    if kind == "units":
        rows = list(PropertyUnit.objects.filter(user_id=owner_id).order_by("listing_id", "position", "unit_number"))
        names = _property_names({u.listing_id for u in rows})
        tenants = {}
        for a in RenterUnitAssociation.objects.filter(unit_id__in=[u.id for u in rows], status__iexact="ACTIVE"):
            tenants[str(a.unit_id)] = a.renter_name
        header = ["Property", "Unit", "Type", "Bedrooms", "Bathrooms", "Rent (KES)", "Deposit (KES)", "Availability", "Tenant", "Rent due day"]
        body = [[names.get(str(u.listing_id), ""), u.unit_number, u.unit_type, u.beds, u.baths, _money(u.rent), _money(u.deposit_amount),
                 u.availability, tenants.get(str(u.id), ""), u.rent_due_day] for u in rows]
        return "Units", header, body
    return None


class PMSExportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        access = pms_access(request.user)
        if not access.get("allowed"):
            return Response({"detail": "An active PMS subscription is required to export records.", "pms_access": access}, status=403)
        owner_id = _owner_id(request.user)
        if not owner_id:
            return Response({"detail": "No PMS account found."}, status=403)
        kind = str(request.query_params.get("kind", "invoices")).lower()
        fmt = str(request.query_params.get("format", "csv")).lower()
        built = _build(kind, owner_id)
        if built is None or fmt not in {"csv", "pdf"}:
            return Response({"detail": "kind must be invoices, payments, tenants or units; format must be csv or pdf."}, status=400)
        title, header, body = built
        stamp = date.today().isoformat()
        filename = f"saka-krib-{kind}-{stamp}.{fmt}"

        if fmt == "csv":
            buf = io.StringIO()
            writer = csv.writer(buf)
            writer.writerow(header)
            for row in body:
                # Neutralise spreadsheet formula injection in free-text cells.
                writer.writerow([("'" + str(c)) if isinstance(c, str) and c[:1] in "=+-@" and not c.replace(".", "", 1).isdigit() else c for c in row])
            response = HttpResponse("﻿" + buf.getvalue(), content_type="text/csv; charset=utf-8")
            response["Content-Disposition"] = f'attachment; filename="{filename}"'
            return response

        out = io.BytesIO()
        doc = SimpleDocTemplate(out, pagesize=landscape(A4), leftMargin=12 * mm, rightMargin=12 * mm, topMargin=14 * mm, bottomMargin=12 * mm, title=title)
        styles = getSampleStyleSheet()
        cell = styles["BodyText"]
        cell.fontSize = 7
        cell.leading = 9
        data = [header] + [[Paragraph(str(c), cell) for c in row] for row in body]
        table = Table(data, repeatRows=1)
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1d4ed8")), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTSIZE", (0, 0), (-1, 0), 7.5), ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f3f4f6")]),
            ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#d1d5db")), ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]))
        doc.build([Paragraph(f"Saka Krib · {title}", styles["Title"]), Paragraph(f"Generated {stamp} · {len(body)} rows", styles["Normal"]), Spacer(1, 6), table])
        response = HttpResponse(out.getvalue(), content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response
