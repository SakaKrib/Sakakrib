from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.authorization import can_manage_listings
from .models import LandlordPaymentMethod


def _payload(method):
    return {
        'id': str(method.id),
        'provider': method.provider,
        'mpesa_method': method.mpesa_method,
        'display_name': method.display_name,
        'paybill_number': method.paybill_number,
        'paybill_account': method.paybill_account,
        'till_number': method.till_number,
        'paypal_email': method.paypal_email,
        'is_default': method.is_default,
        'is_active': method.is_active,
        'created_at': method.created_at,
        'updated_at': method.updated_at,
    }


class LandlordPaymentMethodView(APIView):
    def post(self, request):
        if not can_manage_listings(request.user):
            return Response({'detail': 'Landlord access is required.'}, status=403)
        provider = str(request.data.get('provider') or '').upper()
        display_name = request.data.get('display_name')
        display_name = str(display_name).strip() if display_name is not None else None
        display_name = display_name or None
        try:
            if provider == 'PAYPAL':
                email = str(request.data.get('paypal_email') or '').strip().lower()
                if not email or '@' not in email:
                    raise ValueError('A valid PayPal email is required.')
                method = LandlordPaymentMethod.objects.create(
                    landlord_id=request.user.id, provider='PAYPAL', display_name=display_name,
                    paypal_email=email, mpesa_method=None, paybill_number=None,
                    paybill_account=None, till_number=None,
                )
            elif provider == 'MPESA':
                mpesa_method = str(request.data.get('mpesa_method') or '').upper()
                if mpesa_method == 'PAYBILL':
                    number = str(request.data.get('paybill_number') or '').strip()
                    account = str(request.data.get('paybill_account') or '').strip()
                    if not number or not account:
                        raise ValueError('PayBill number and account are required.')
                    method = LandlordPaymentMethod.objects.create(
                        landlord_id=request.user.id, provider='MPESA', mpesa_method='PAYBILL',
                        display_name=display_name, paybill_number=number, paybill_account=account,
                        till_number=None, paypal_email=None,
                    )
                elif mpesa_method == 'TILL':
                    till = str(request.data.get('till_number') or '').strip()
                    if not till:
                        raise ValueError('Till number is required.')
                    method = LandlordPaymentMethod.objects.create(
                        landlord_id=request.user.id, provider='MPESA', mpesa_method='TILL',
                        display_name=display_name, till_number=till, paybill_number=None,
                        paybill_account=None, paypal_email=None,
                    )
                else:
                    raise ValueError('M-Pesa method must be PAYBILL or TILL.')
            else:
                raise ValueError('Payment provider must be MPESA or PAYPAL.')
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=400)
        return Response(_payload(method), status=201)

    def delete(self, request, payment_method_id):
        if not can_manage_listings(request.user):
            return Response({'detail': 'Landlord access is required.'}, status=403)
        method = LandlordPaymentMethod.objects.filter(id=payment_method_id, landlord_id=request.user.id).first()
        if method is None:
            return Response({'detail': 'Payment method not found.'}, status=404)
        method.delete()
        return Response({'success': True})
