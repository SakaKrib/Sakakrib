from django.db import transaction
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.authorization import can_manage_listings, is_admin, pms_access
from .models import LandlordPaymentMethod


def _payload(method):
    return {
        'id': str(method.id), 'provider': method.provider, 'mpesa_method': method.mpesa_method,
        'display_name': method.display_name, 'paybill_number': method.paybill_number,
        'paybill_account': method.paybill_account, 'till_number': method.till_number,
        'paypal_email': method.paypal_email, 'is_default': method.is_default,
        'is_active': method.is_active, 'created_at': method.created_at, 'updated_at': method.updated_at,
    }


def _allowed(request, write=False):
    if is_admin(request.user):
        return True, None
    if not can_manage_listings(request.user) or str(getattr(request.user, 'role', '')).lower() != 'landlord':
        return False, Response({'detail': 'Landlord access is required.'}, status=403)
    access = pms_access(request.user)
    if not access.get('allowed'):
        return False, Response({'detail': 'Landlord PMS access is required.', 'pms_access': access}, status=403)
    if write and access.get('read_only'):
        return False, Response({'detail': 'PMS is read-only during the subscription grace period.', 'pms_access': access}, status=403)
    return True, None


class LandlordPaymentMethodView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        allowed, denied = _allowed(request)
        if not allowed:
            return denied
        methods = LandlordPaymentMethod.objects.filter(landlord_id=request.user.id, is_active=True).order_by('-is_default', '-created_at')
        return Response([_payload(method) for method in methods])

    def post(self, request):
        allowed, denied = _allowed(request, write=True)
        if not allowed:
            return denied
        provider = str(request.data.get('provider') or '').upper()
        display_name = str(request.data.get('display_name') or '').strip() or None
        try:
            if provider == 'PAYPAL':
                email = str(request.data.get('paypal_email') or '').strip().lower()
                if not email or '@' not in email:
                    raise ValueError('A valid PayPal email is required.')
                method = LandlordPaymentMethod.objects.create(landlord_id=request.user.id, provider='PAYPAL', display_name=display_name, paypal_email=email)
            elif provider == 'MPESA':
                mpesa_method = str(request.data.get('mpesa_method') or '').upper()
                if mpesa_method == 'PAYBILL':
                    number, account = str(request.data.get('paybill_number') or '').strip(), str(request.data.get('paybill_account') or '').strip()
                    if not number or not account:
                        raise ValueError('PayBill number and account are required.')
                    method = LandlordPaymentMethod.objects.create(landlord_id=request.user.id, provider='MPESA', mpesa_method='PAYBILL', display_name=display_name, paybill_number=number, paybill_account=account)
                elif mpesa_method == 'TILL':
                    till = str(request.data.get('till_number') or '').strip()
                    if not till:
                        raise ValueError('Till number is required.')
                    method = LandlordPaymentMethod.objects.create(landlord_id=request.user.id, provider='MPESA', mpesa_method='TILL', display_name=display_name, till_number=till)
                else:
                    raise ValueError('M-Pesa method must be PAYBILL or TILL.')
            else:
                raise ValueError('Payment provider must be MPESA or PAYPAL.')
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=400)
        if request.data.get('is_default'):
            with transaction.atomic():
                LandlordPaymentMethod.objects.filter(landlord_id=request.user.id).exclude(id=method.id).update(is_default=False)
                method.is_default = True
                method.save(update_fields=['is_default', 'updated_at'])
        return Response(_payload(method), status=201)

    def patch(self, request, payment_method_id):
        allowed, denied = _allowed(request, write=True)
        if not allowed:
            return denied
        method = LandlordPaymentMethod.objects.filter(id=payment_method_id, landlord_id=request.user.id, is_active=True).first()
        if method is None:
            return Response({'detail': 'Payment method not found.'}, status=404)
        if 'display_name' in request.data:
            method.display_name = str(request.data.get('display_name') or '').strip() or method.display_name
        if method.provider == 'PAYPAL' and 'paypal_email' in request.data:
            email = str(request.data.get('paypal_email') or '').strip().lower()
            if not email or '@' not in email:
                return Response({'detail': 'A valid PayPal email is required.'}, status=400)
            method.paypal_email = email
        if method.provider == 'MPESA':
            if 'paybill_number' in request.data: method.paybill_number = str(request.data.get('paybill_number') or '').strip() or None
            if 'paybill_account' in request.data: method.paybill_account = str(request.data.get('paybill_account') or '').strip() or None
            if 'till_number' in request.data: method.till_number = str(request.data.get('till_number') or '').strip() or None
        if request.data.get('is_default'):
            with transaction.atomic():
                LandlordPaymentMethod.objects.filter(landlord_id=request.user.id).update(is_default=False)
                method.is_default = True
        method.save()
        return Response(_payload(method))

    def delete(self, request, payment_method_id):
        allowed, denied = _allowed(request, write=True)
        if not allowed:
            return denied
        method = LandlordPaymentMethod.objects.filter(id=payment_method_id, landlord_id=request.user.id, is_active=True).first()
        if method is None:
            return Response({'detail': 'Payment method not found.'}, status=404)
        method.is_active = False
        method.is_default = False
        method.save(update_fields=['is_active', 'is_default', 'updated_at'])
        return Response({'success': True})
