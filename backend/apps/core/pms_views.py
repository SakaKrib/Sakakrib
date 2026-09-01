from decimal import Decimal
from django.db import transaction
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.authorization import can_manage_listings
from apps.core.models import (
    LandlordPaymentMethod,
    ListingMedia,
    PMSSubscriptionNotification,
    PropertyUnit,
    RentInvoice,
    RentPayment,
    RentPaymentSubmission,
    UserNotification,
)
from apps.listings.models import Listing
from apps.listings.services import get_listing_entitlement
from apps.payments.models import ListingPayment
from apps.subscriptions.models import LandlordSubscription, SubscriptionInvoice, SubscriptionListing, SubscriptionPlan
from apps.subscriptions.services import get_current_subscription, get_subscription_access, get_subscription_plan


def _decimal(value):
    return None if value is None else float(Decimal(value))


def _subscription(profile):
    sub = get_current_subscription(profile)
    plan = get_subscription_plan(sub)
    return sub, plan


def _subscription_payload(profile):
    sub, plan = _subscription(profile)
    return {
        'id': str(sub.id) if sub else None,
        'subscription_id': str(sub.id) if sub else None,
        'landlord_id': str(profile.id),
        'plan_id': str(plan.id) if plan else None,
        'plan_name': plan.name if plan else None,
        'max_listings': plan.max_listings if plan else None,
        'billing_cycle': sub.billing_cycle if sub else None,
        'status': sub.status if sub else None,
        'current_period_start': sub.current_period_start if sub else None,
        'current_period_end': sub.current_period_end if sub else None,
        'grace_period_end': sub.grace_period_end if sub else None,
        'auto_renew': bool(sub.auto_renew) if sub else False,
    } if sub else None


def _plans():
    return [{
        'id': str(p.id), 'name': p.name, 'audience': p.audience,
        'max_listings': p.max_listings,
        'max_units_per_listing': p.max_units_per_listing,
        'monthly_price_kes': _decimal(p.monthly_price_kes),
        'annual_price_kes': _decimal(p.annual_price_kes),
    } for p in SubscriptionPlan.objects.filter(audience='LANDLORD').order_by('monthly_price_kes')]


def _listings(profile):
    rows = Listing.objects.filter(user_id=profile.id).order_by('-created_at')
    media = ListingMedia.objects.filter(listing_id__in=[r.id for r in rows]).order_by('position')
    covers = {}
    for item in media:
        covers.setdefault(str(item.listing_id), item.url)
    return [{
        'id': str(x.id), 'user_id': str(x.user_id), 'title': x.title, 'description': x.description,
        'city': x.city, 'county': x.county, 'location_search': x.location_search,
        'latitude': x.latitude, 'longitude': x.longitude, 'property_name': x.property_name,
        'property_type': x.property_type, 'price_kes': _decimal(x.price_kes), 'listing_type': x.listing_type,
        'deposit_required': x.deposit_required, 'deposit_structure': x.deposit_structure,
        'deposit_amount': _decimal(x.deposit_amount), 'size': x.size, 'beds': x.beds, 'baths': x.baths,
        'contact_phone': x.contact_phone, 'contact_email': x.contact_email, 'social_links': x.social_links,
        'booking_enabled': x.booking_enabled, 'payment_enabled': x.payment_enabled,
        'is_property_management': x.is_property_management, 'is_paid': x.is_paid,
        'is_published': x.is_published, 'approval_status': x.approval_status, 'is_approved': x.is_approved,
        'admin_reviewed_at': x.admin_reviewed_at, 'admin_review_note': x.admin_review_note,
        'status': x.status, 'created_at': x.created_at, 'updated_at': x.updated_at,
        'cover_photo_url': covers.get(str(x.id)),
    } for x in rows]


def _pms_listings(profile):
    sub, _ = _subscription(profile)
    if not sub:
        return []
    rows = SubscriptionListing.objects.filter(subscription_id=sub.id, status='ACTIVE')
    listings = {str(x.id): x for x in Listing.objects.filter(id__in=[r.listing_id for r in rows])}
    return [{
        'subscription_listing_id': str(r.id), 'subscription_id': str(r.subscription_id),
        'listing_id': str(r.listing_id), 'listing_title': listings.get(str(r.listing_id)).title if listings.get(str(r.listing_id)) else '',
        'listing_city': listings.get(str(r.listing_id)).city if listings.get(str(r.listing_id)) else '',
        'listing_price_kes': _decimal(listings.get(str(r.listing_id)).price_kes) if listings.get(str(r.listing_id)) else None,
        'status': r.status, 'activated_at': r.activated_at,
    } for r in rows]


def _available_pms_listings(profile):
    managed = {str(x['listing_id']) for x in _pms_listings(profile)}
    return [{
        'listing_id': str(x.id), 'title': x.title, 'city': x.city,
        'price_kes': _decimal(x.price_kes), 'created_at': x.created_at,
    } for x in Listing.objects.filter(user_id=profile.id, is_property_management=True, is_approved=True).order_by('-created_at') if str(x.id) not in managed]


def _units(profile, listing_id=None):
    qs = PropertyUnit.objects.filter(user_id=profile.id)
    if listing_id:
        qs = qs.filter(listing_id=listing_id)
    listing_ids = list(qs.values_list('listing_id', flat=True))
    titles = {str(x.id): x.title for x in Listing.objects.filter(id__in=listing_ids)}
    assoc = {}
    # One active association per unit is the production contract; choose the newest active row.
    from apps.core.models import RenterUnitAssociation
    for a in RenterUnitAssociation.objects.filter(unit_id__in=list(qs.values_list('id', flat=True)), status='ACTIVE').order_by('-created_at'):
        assoc.setdefault(str(a.unit_id), a)
    return [{
        'unit_id': str(x.id), 'listing_id': str(x.listing_id), 'listing_title': titles.get(str(x.listing_id), ''),
        'unit_number': x.unit_number, 'unit_type': x.unit_type, 'rent': _decimal(x.rent),
        'beds': x.beds, 'baths': x.baths, 'availability': x.availability,
        'renter_name': assoc.get(str(x.id)).renter_name if assoc.get(str(x.id)) else None,
        'renter_assoc_id': str(assoc.get(str(x.id)).id) if assoc.get(str(x.id)) else None,
        'renter_phone': assoc.get(str(x.id)).renter_phone if assoc.get(str(x.id)) else None,
        'renter_email': assoc.get(str(x.id)).renter_email if assoc.get(str(x.id)) else None,
        'lease_start': assoc.get(str(x.id)).lease_start if assoc.get(str(x.id)) else None,
        'lease_end': assoc.get(str(x.id)).lease_end if assoc.get(str(x.id)) else None,
        'assoc_status': assoc.get(str(x.id)).status if assoc.get(str(x.id)) else None,
    } for x in qs.order_by('position', 'created_at')]


def _notifications(profile):
    normal = [{
        'id': str(x.id), 'source': 'USER', 'notification_type': x.notification_type,
        'title': x.title, 'message': x.message, 'action_payload': x.data,
        'read': bool(x.read_at), 'created_at': x.created_at, 'read_at': x.read_at,
    } for x in UserNotification.objects.filter(user_id=profile.id).order_by('-created_at')]
    pms = [{
        'id': str(x.id), 'source': 'PMS', 'notification_type': x.notification_type,
        'title': x.title, 'message': x.message, 'action_type': x.action_type,
        'action_required': x.action_required, 'read': x.in_app_read,
        'created_at': x.created_at, 'read_at': x.read_at,
    } for x in PMSSubscriptionNotification.objects.filter(landlord_id=profile.id).order_by('-created_at')]
    return sorted(normal + pms, key=lambda x: x['created_at'], reverse=True)


def _rent_data(profile):
    invoices = RentInvoice.objects.filter(landlord_id=profile.id).order_by('-due_date')
    payments = RentPayment.objects.filter(landlord_id=profile.id).order_by('-created_at')
    submissions = RentPaymentSubmission.objects.filter(landlord_id=profile.id).order_by('-submitted_at')
    return (
        [{
            'id': str(x.id), 'invoice_number': x.invoice_number, 'landlord_id': str(x.landlord_id),
            'renter_user_id': str(x.renter_user_id) if x.renter_user_id else None,
            'renter_assoc_id': str(x.renter_assoc_id), 'listing_id': str(x.listing_id), 'unit_id': str(x.unit_id),
            'billing_period_start': x.billing_period_start, 'billing_period_end': x.billing_period_end,
            'due_date': x.due_date, 'amount_kes': _decimal(x.amount_kes), 'currency': x.currency,
            'status': x.status, 'payment_method_id': str(x.payment_method_id) if x.payment_method_id else None,
            'payment_destination_snapshot': x.payment_destination_snapshot, 'paid_at': x.paid_at,
            'confirmed_by': str(x.confirmed_by) if x.confirmed_by else None, 'confirmed_at': x.confirmed_at,
            'created_at': x.created_at, 'updated_at': x.updated_at,
        } for x in invoices],
        [{
            'id': str(x.id), 'renter_assoc_id': str(x.renter_assoc_id), 'unit_id': str(x.unit_id),
            'landlord_id': str(x.landlord_id), 'amount_kes': _decimal(x.amount_kes),
            'period_year': x.period_year, 'period_month': x.period_month, 'status': x.status,
            'mpesa_receipt': x.mpesa_receipt, 'checkout_request_id': x.checkout_request_id,
            'paid_at': x.paid_at, 'payment_provider': x.payment_provider, 'payment_method': x.payment_method,
            'provider_reference': x.provider_reference, 'provider_amount': _decimal(x.provider_amount),
            'provider_currency': x.provider_currency, 'paypal_order_id': x.paypal_order_id,
            'paypal_fx_rate': _decimal(x.paypal_fx_rate), 'merchant_request_id': x.merchant_request_id,
            'phone_number': x.phone_number, 'result_code': x.result_code, 'result_description': x.result_description,
            'payment_method_id': str(x.payment_method_id) if x.payment_method_id else None,
            'created_at': x.created_at, 'updated_at': x.updated_at,
        } for x in payments],
        [{
            'id': str(x.id), 'invoice_id': str(x.invoice_id),
            'renter_user_id': str(x.renter_user_id) if x.renter_user_id else None,
            'landlord_id': str(x.landlord_id), 'renter_assoc_id': str(x.renter_assoc_id),
            'unit_id': str(x.unit_id), 'transaction_reference': x.transaction_reference,
            'status': x.status, 'submitted_at': x.submitted_at,
            'confirmed_by': str(x.confirmed_by) if x.confirmed_by else None,
            'confirmed_at': x.confirmed_at, 'rejection_reason': x.rejection_reason,
            'created_at': x.created_at, 'updated_at': x.updated_at,
        } for x in submissions],
    )


class PMSDashboardView(APIView):
    def get(self, request):
        profile = request.user
        if not can_manage_listings(profile):
            return Response({'detail': 'Landlord access is required.'}, status=403)
        sub, access_plan = _subscription(profile)
        access = get_subscription_access(profile)
        entitlement = get_listing_entitlement(profile)
        listings = _listings(profile)
        pms = _pms_listings(profile)
        units = _units(profile)
        rent_invoices, rent_payments, submissions = _rent_data(profile)
        listing_payments = ListingPayment.objects.filter(user_id=profile.id).order_by('-created_at')
        methods = LandlordPaymentMethod.objects.filter(landlord_id=profile.id).order_by('-is_default', '-created_at')
        invoices = SubscriptionInvoice.objects.filter(landlord_subscription_id=sub.id).order_by('-created_at') if sub else SubscriptionInvoice.objects.none()
        return Response({
            'subscription': _subscription_payload(profile),
            'subscriptionAccess': access,
            'entitlement': entitlement,
            'capacity': {
                'listings_used': len(pms), 'max_listings': access_plan.max_listings if access_plan else None,
                'listings_remaining': max(0, access_plan.max_listings - len(pms)) if access_plan and access_plan.max_listings is not None else None,
                'max_units_per_listing': access_plan.max_units_per_listing if access_plan else None,
            },
            'listings': listings,
            'listingSummary': {
                'total': len(listings), 'published': sum(bool(x['is_published']) for x in listings),
                'unpublished': sum(not bool(x['is_published']) for x in listings),
                'approved': sum(bool(x['is_approved']) or str(x['approval_status']).lower() == 'approved' for x in listings),
                'pending_approval': sum(not x['is_approved'] and str(x['approval_status']).lower() not in ('approved', 'rejected', 'declined') for x in listings),
                'rejected': sum(str(x['approval_status']).lower() in ('rejected', 'declined') for x in listings),
                'paid': sum(bool(x['is_paid']) for x in listings), 'unpaid': sum(not bool(x['is_paid']) for x in listings),
                'pms_managed': len(pms),
            },
            'pmsListings': pms, 'availableListings': _available_pms_listings(profile), 'units': units,
            'plans': _plans(),
            'paymentMethods': [{
                'id': str(x.id), 'provider': x.provider, 'mpesa_method': x.mpesa_method,
                'display_name': x.display_name, 'paybill_number': x.paybill_number, 'paybill_account': x.paybill_account,
                'till_number': x.till_number, 'paypal_email': x.paypal_email, 'is_default': x.is_default,
                'is_active': x.is_active, 'created_at': x.created_at, 'updated_at': x.updated_at,
            } for x in methods],
            'listingPayments': [{
                'id': str(x.id), 'listing_id': str(x.listing_id) if x.listing_id else None, 'user_id': str(x.user_id),
                'amount_kes': _decimal(x.amount_kes), 'mpesa_receipt': x.mpesa_receipt,
                'checkout_request_id': x.checkout_request_id, 'merchant_request_id': x.merchant_request_id,
                'phone_number': x.phone_number, 'status': x.status, 'result_code': x.result_code,
                'result_description': x.result_description, 'payment_provider': x.payment_provider,
                'payment_method': x.payment_method, 'provider_reference': x.provider_reference,
                'provider_amount': _decimal(x.provider_amount), 'provider_currency': x.provider_currency,
                'paypal_order_id': x.paypal_order_id, 'paypal_fx_rate': _decimal(x.paypal_fx_rate),
                'created_at': x.created_at, 'paid_at': x.paid_at,
            } for x in listing_payments],
            'subscriptionInvoices': [{
                'id': str(x.id), 'amount_kes': _decimal(x.amount_kes), 'amount_usd': _decimal(x.amount_usd),
                'currency': x.currency, 'mpesa_receipt': x.mpesa_receipt, 'checkout_request_id': x.checkout_request_id,
                'merchant_request_id': x.merchant_request_id, 'phone_number': x.phone_number, 'status': x.status,
                'result_code': x.result_code, 'result_description': x.result_description, 'payment_provider': x.payment_provider,
                'payment_method': x.payment_method, 'provider_reference': x.provider_reference,
                'provider_transaction_id': x.provider_transaction_id, 'billing_period_start': x.billing_period_start,
                'billing_period_end': x.billing_period_end, 'created_at': x.created_at, 'paid_at': x.paid_at,
            } for x in invoices],
            'notifications': _notifications(profile), 'rentInvoices': rent_invoices, 'rentPayments': rent_payments,
            'pendingRentSubmissions': submissions,
            'rentSummary': {
                'invoice_count': len(rent_invoices),
                'total_invoiced_kes': sum(x['amount_kes'] or 0 for x in rent_invoices),
                'paid_invoice_count': sum(str(x['status']).upper() == 'PAID' for x in rent_invoices),
                'paid_amount_kes': sum(x['amount_kes'] or 0 for x in rent_invoices if str(x['status']).upper() == 'PAID'),
                'pending_invoice_count': sum(str(x['status']).upper() in ('PENDING', 'OPEN', 'UNPAID', 'PROCESSING', 'DUE') for x in rent_invoices),
                'pending_amount_kes': sum(x['amount_kes'] or 0 for x in rent_invoices if str(x['status']).upper() in ('PENDING', 'OPEN', 'UNPAID', 'PROCESSING', 'DUE')),
                'overdue_invoice_count': sum(str(x['status']).upper() == 'OVERDUE' or (str(x['status']).upper() != 'PAID' and x['due_date'] < timezone.localdate()) for x in rent_invoices),
                'overdue_amount_kes': sum(x['amount_kes'] or 0 for x in rent_invoices if str(x['status']).upper() == 'OVERDUE' or (str(x['status']).upper() != 'PAID' and x['due_date'] < timezone.localdate())),
                'pending_submission_count': sum(str(x['status']).upper() == 'PENDING' for x in submissions),
                'payment_count': len(rent_payments),
                'total_payments_kes': sum(x['amount_kes'] or 0 for x in rent_payments if str(x['status']).upper() == 'PAID'),
            },
        })


class PMSActionView(APIView):
    def post(self, request):
        profile = request.user
        if not can_manage_listings(profile):
            return Response({'detail': 'Landlord access is required.'}, status=403)
        action = request.data.get('action')
        try:
            if action == 'add_listing':
                sub, _ = _subscription(profile)
                if not sub or sub.status not in ('ACTIVE', 'GRACE_PERIOD'):
                    raise ValueError('An active PMS subscription is required.')
                listing_id = request.data.get('listing_id')
                if not listing_id:
                    raise ValueError('A listing is required.')
                listing = Listing.objects.get(id=listing_id, user_id=profile.id, is_property_management=True)
                obj, _ = SubscriptionListing.objects.get_or_create(subscription_id=sub.id, listing_id=listing.id, defaults={'status': 'ACTIVE', 'activated_at': timezone.now(), 'created_at': timezone.now()})
                if obj.status != 'ACTIVE':
                    obj.status = 'ACTIVE'; obj.activated_at = timezone.now(); obj.deactivated_at = None; obj.save(update_fields=['status','activated_at','deactivated_at'])
                return Response({'success': True, 'subscription_listing_id': str(obj.id)})
            if action == 'remove_listing':
                sub, _ = _subscription(profile)
                obj = SubscriptionListing.objects.get(subscription_id=sub.id, listing_id=request.data.get('listing_id'), status='ACTIVE')
                obj.status = 'INACTIVE'; obj.deactivated_at = timezone.now(); obj.save(update_fields=['status','deactivated_at'])
                return Response({'success': True})
            if action == 'set_payment_method_default':
                method = LandlordPaymentMethod.objects.get(id=request.data.get('payment_method_id'), landlord_id=profile.id, is_active=True)
                with transaction.atomic():
                    LandlordPaymentMethod.objects.filter(landlord_id=profile.id).update(is_default=False)
                    method.is_default = True; method.save(update_fields=['is_default'])
                return Response({'success': True})
            if action == 'mark_user_notification_read':
                obj = UserNotification.objects.get(id=request.data.get('notification_id'), user_id=profile.id)
                obj.read_at = timezone.now(); obj.save(update_fields=['read_at']); return Response({'success': True})
            if action == 'mark_pms_notification_read':
                obj = PMSSubscriptionNotification.objects.get(id=request.data.get('notification_id'), landlord_id=profile.id)
                obj.in_app_read = True; obj.read_at = timezone.now(); obj.save(update_fields=['in_app_read','read_at']); return Response({'success': True})
        except (Listing.DoesNotExist, LandlordPaymentMethod.DoesNotExist, UserNotification.DoesNotExist, PMSSubscriptionNotification.DoesNotExist, SubscriptionListing.DoesNotExist):
            return Response({'detail': 'Requested PMS resource was not found.'}, status=404)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=400)
        return Response({'detail': 'Unsupported PMS action.'}, status=400)
