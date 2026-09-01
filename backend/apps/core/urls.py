from django.urls import path

from .rent_views import (
    LandlordRentInvoiceCreateView,
    LandlordRentPaymentConfirmView,
    LandlordRentPaymentRejectView,
    RenterInvoicePaymentSubmitView,
    RenterPaidInvoiceCreateView,
)

urlpatterns = [
    path("invoices/landlord/", LandlordRentInvoiceCreateView.as_view(), name="rent-invoice-create-landlord"),
    path("invoices/renter/paid/", RenterPaidInvoiceCreateView.as_view(), name="rent-invoice-create-renter-paid"),
    path("invoices/<uuid:invoice_id>/submit-payment/", RenterInvoicePaymentSubmitView.as_view(), name="rent-invoice-submit-payment"),
    path("payment-submissions/<uuid:submission_id>/confirm/", LandlordRentPaymentConfirmView.as_view(), name="rent-payment-confirm"),
    path("payment-submissions/<uuid:submission_id>/reject/", LandlordRentPaymentRejectView.as_view(), name="rent-payment-reject"),
]
