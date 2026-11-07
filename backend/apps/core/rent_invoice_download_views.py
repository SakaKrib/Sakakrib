from decimal import Decimal
from io import BytesIO

from django.http import FileResponse
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.authorization import can_manage_listings
from apps.accounts.models import Profile

from .domain_property import PropertyUnit
from .domain_rent import RentInvoice, RentInvoicePeriod

BRAND = colors.HexColor("#1d4ed8")
MUTED = colors.HexColor("#6b7280")
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _row(pdf, y, label, value, bold=False):
    pdf.setFillColor(MUTED)
    pdf.setFont("Helvetica", 9)
    pdf.drawString(50, y, label.upper())
    pdf.setFillColor(colors.black)
    pdf.setFont("Helvetica-Bold" if bold else "Helvetica", 11)
    pdf.drawString(190, y, str(value or "—")[:70])
    return y - 22


class RentInvoiceDownloadView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, invoice_id):
        from apps.listings.models import Listing

        invoice = RentInvoice.objects.filter(pk=invoice_id).first()
        if invoice is None:
            return Response({"detail": "Invoice not found."}, status=404)
        is_landlord = can_manage_listings(request.user) and str(invoice.landlord_id) == str(request.user.id)
        is_renter = str(invoice.renter_user_id) == str(request.user.id)
        if not (is_landlord or is_renter):
            return Response({"detail": "You are not authorized to download this invoice."}, status=403)

        owner = Profile.objects.filter(pk=invoice.landlord_id).only("full_name", "email", "phone").first()
        renter = Profile.objects.filter(pk=invoice.renter_user_id).only("full_name", "email", "phone").first()
        listing = Listing.objects.filter(pk=invoice.listing_id).only("property_name", "title", "city", "county").first()
        unit = PropertyUnit.objects.filter(pk=invoice.unit_id).only("unit_number", "unit_type").first()
        periods = list(RentInvoicePeriod.objects.filter(invoice_id=invoice.id).order_by("period_year", "period_month"))
        destination = invoice.payment_destination_snapshot or {}
        generated_by = "Landlord / property manager" if destination else "Renter (rent paid externally)"
        paid = invoice.status == "PAID"

        buffer = BytesIO()
        pdf = canvas.Canvas(buffer, pagesize=A4)
        width, height = A4
        pdf.setTitle(invoice.invoice_number)

        # Header band
        pdf.setFillColor(BRAND)
        pdf.rect(0, height - 90, width, 90, stroke=0, fill=1)
        pdf.setFillColor(colors.white)
        pdf.setFont("Helvetica-Bold", 22)
        pdf.drawString(50, height - 50, "Saka Krib")
        pdf.setFont("Helvetica", 11)
        pdf.drawString(50, height - 70, "Rent invoice" if not paid else "Rent receipt")
        pdf.setFont("Helvetica-Bold", 12)
        pdf.drawRightString(width - 50, height - 50, invoice.invoice_number)
        pdf.setFont("Helvetica", 10)
        pdf.drawRightString(width - 50, height - 70, f"Status: {invoice.status.replace('_', ' ').title()}")

        y = height - 130
        property_name = (listing.property_name or listing.title) if listing else ""
        location = ", ".join(x for x in (getattr(listing, "city", ""), getattr(listing, "county", "")) if x)
        y = _row(pdf, y, "Property", property_name, bold=True)
        if location:
            y = _row(pdf, y, "Location", location)
        y = _row(pdf, y, "Unit", f"{unit.unit_number} ({unit.unit_type})" if unit else "")
        y = _row(pdf, y, "Landlord / manager", owner.full_name if owner else "")
        y = _row(pdf, y, "Renter", renter.full_name if renter else "")
        if periods:
            y = _row(pdf, y, "Rent for", ", ".join(f"{MONTHS[p.period_month - 1]} {p.period_year}" for p in periods))
        else:
            y = _row(pdf, y, "Billing period", f"{invoice.billing_period_start} to {invoice.billing_period_end}")
        y = _row(pdf, y, "Due date", invoice.due_date)
        y = _row(pdf, y, "Invoice raised by", generated_by)

        y -= 6
        pdf.setStrokeColor(colors.HexColor("#e5e7eb"))
        pdf.line(50, y, width - 50, y)
        y -= 34
        pdf.setFillColor(MUTED)
        pdf.setFont("Helvetica", 9)
        pdf.drawString(50, y + 14, "AMOUNT")
        pdf.setFillColor(colors.black)
        pdf.setFont("Helvetica-Bold", 22)
        pdf.drawString(50, y - 8, f"{invoice.currency} {Decimal(invoice.amount_kes):,.2f}")
        y -= 44

        if destination:
            pdf.setFont("Helvetica-Bold", 11)
            pdf.drawString(50, y, "How to pay")
            y -= 18
            labels = {"provider": "Method", "mpesa_method": "M-Pesa type", "display_name": "Account name", "paybill_number": "Paybill",
                      "paybill_account": "Account no.", "till_number": "Till", "paypal_email": "PayPal",
                      "bank_name": "Bank", "bank_account_name": "Account holder", "bank_account_number": "Bank account no.", "bank_branch": "Branch"}
            for key, label in labels.items():
                value = destination.get(key)
                if value:
                    y = _row(pdf, y, label, value)
            y -= 4
        if invoice.transaction_reference or invoice.payment_method or invoice.payment_date:
            pdf.setFont("Helvetica-Bold", 11)
            pdf.drawString(50, y, "Payment details")
            y -= 18
            y = _row(pdf, y, "Transaction ID", invoice.transaction_reference, bold=True)
            y = _row(pdf, y, "Payment method", invoice.payment_method)
            y = _row(pdf, y, "Payment date", invoice.payment_date)
            if invoice.confirmed_at:
                y = _row(pdf, y, "Confirmed by landlord", invoice.confirmed_at.strftime("%d %b %Y %H:%M"))

        if paid:
            pdf.setStrokeColor(colors.HexColor("#16a34a"))
            pdf.setFillColor(colors.HexColor("#16a34a"))
            pdf.setLineWidth(2)
            pdf.roundRect(width - 190, 90, 140, 44, 8, stroke=1, fill=0)
            pdf.setFont("Helvetica-Bold", 20)
            pdf.drawCentredString(width - 120, 104, "PAID")
        pdf.setFillColor(MUTED)
        pdf.setFont("Helvetica-Oblique", 8)
        pdf.drawString(50, 45, "Generated by Saka Krib. This document reflects the payment status recorded in the rent workflow.")
        pdf.showPage()
        pdf.save()
        buffer.seek(0)
        return FileResponse(buffer, as_attachment=True, filename=f"{invoice.invoice_number}.pdf", content_type="application/pdf")
