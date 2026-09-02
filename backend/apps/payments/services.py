import base64
import json
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Any

from django.conf import settings


@dataclass(frozen=True)
class PaymentResult:
    success: bool
    provider_reference: str | None = None
    message: str = ''
    raw: dict[str, Any] | None = None


def _request_json(url: str, *, method: str = 'GET', data: dict | None = None,
                  headers: dict[str, str] | None = None, timeout: int = 30) -> dict[str, Any]:
    payload = None
    request_headers = {'Accept': 'application/json', **(headers or {})}
    if data is not None:
        payload = json.dumps(data).encode()
        request_headers.setdefault('Content-Type', 'application/json')
    request = urllib.request.Request(url, data=payload, headers=request_headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode())
    except urllib.error.HTTPError as exc:
        body = exc.read().decode(errors='replace')
        raise RuntimeError(f'Payment provider HTTP {exc.code}: {body}') from exc


def get_exchange_rate(base: str, quote: str) -> Decimal:
    """Return the server-side ExchangeRate-API conversion rate for a pair."""
    base = base.strip().upper()
    quote = quote.strip().upper()
    if not base or not quote or base == quote:
        raise ValueError('Base and quote currencies must differ')

    api_key = settings.EXCHANGE_RATE_API_KEY
    base_url = settings.EXCHANGE_RATE_API_BASE_URL.rstrip('/')
    if not api_key:
        raise RuntimeError('Exchange-rate service is not configured')

    result = _request_json(f'{base_url}/{api_key}/pair/{base}/{quote}')
    if result.get('result') != 'success':
        raise RuntimeError(f'Unable to obtain current {base}/{quote} exchange rate')

    try:
        rate = Decimal(str(result['conversion_rate']))
    except (KeyError, TypeError, ValueError):
        raise RuntimeError(f'Unable to obtain current {base}/{quote} exchange rate') from None
    if rate <= 0:
        raise RuntimeError(f'Unable to obtain current {base}/{quote} exchange rate')
    return rate


class PaymentProvider:
    name = 'base'

    def create_payment(self, *, amount: Decimal, currency: str, reference: str,
                       metadata: dict[str, Any], request_id: str | None = None) -> PaymentResult:
        raise NotImplementedError

    def verify_payment(self, *, provider_reference: str) -> PaymentResult:
        raise NotImplementedError


class MpesaProvider(PaymentProvider):
    name = 'mpesa'

    def _access_token(self) -> str:
        key = settings.MPESA_CONSUMER_KEY
        secret = settings.MPESA_CONSUMER_SECRET
        if not key or not secret:
            raise RuntimeError('M-Pesa credentials are not configured')
        credentials = base64.b64encode(f'{key}:{secret}'.encode()).decode()
        result = _request_json(
            f'{settings.MPESA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials',
            headers={'Authorization': f'Basic {credentials}'},
        )
        token = result.get('access_token')
        if not token:
            raise RuntimeError('M-Pesa did not return an access token')
        return token

    def _timestamp_password(self, shortcode: str, passkey: str) -> tuple[str, str]:
        timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
        password = base64.b64encode(f'{shortcode}{passkey}{timestamp}'.encode()).decode()
        return timestamp, password

    def create_payment(self, *, amount: Decimal, currency: str, reference: str,
                       metadata: dict[str, Any], request_id: str | None = None) -> PaymentResult:
        if currency.upper() != 'KES':
            return PaymentResult(False, message='M-Pesa only supports KES payments here')
        phone = metadata.get('phone_number')
        if not phone:
            return PaymentResult(False, message='M-Pesa phone number is required')
        shortcode = settings.MPESA_SHORTCODE
        passkey = settings.MPESA_PASSKEY
        callback = settings.MPESA_CALLBACK_URL
        if not all((shortcode, passkey, callback)):
            return PaymentResult(False, message='M-Pesa shortcode, passkey and callback URL must be configured')
        timestamp, password = self._timestamp_password(shortcode, passkey)
        payload = {
            'BusinessShortCode': shortcode,
            'Password': password,
            'Timestamp': timestamp,
            'TransactionType': metadata.get('transaction_type', 'CustomerPayBillOnline'),
            'Amount': int(Decimal(amount)),
            'PartyA': phone,
            'PartyB': shortcode,
            'PhoneNumber': phone,
            'CallBackURL': callback,
            'AccountReference': reference[:12],
            'TransactionDesc': metadata.get('description', 'SakaKrib payment')[:13],
        }
        result = _request_json(
            f'{settings.MPESA_BASE_URL}/mpesa/stkpush/v1/processrequest',
            method='POST', data=payload,
            headers={'Authorization': f'Bearer {self._access_token()}'},
        )
        code = str(result.get('ResponseCode', ''))
        return PaymentResult(
            success=code == '0',
            provider_reference=result.get('CheckoutRequestID'),
            message=result.get('ResponseDescription', 'M-Pesa request submitted'),
            raw=result,
        )

    def verify_payment(self, *, provider_reference: str) -> PaymentResult:
        """Verify an STK result directly with Daraja rather than trusting a browser/callback payload."""
        shortcode = settings.MPESA_SHORTCODE
        passkey = settings.MPESA_PASSKEY
        if not shortcode or not passkey:
            raise RuntimeError('M-Pesa shortcode and passkey are not configured')
        timestamp, password = self._timestamp_password(shortcode, passkey)
        result = _request_json(
            f'{settings.MPESA_BASE_URL}/mpesa/stkpushquery/v1/query',
            method='POST',
            data={
                'BusinessShortCode': shortcode,
                'Password': password,
                'Timestamp': timestamp,
                'CheckoutRequestID': provider_reference,
            },
            headers={'Authorization': f'Bearer {self._access_token()}'},
        )
        result_code = str(result.get('ResultCode', ''))
        return PaymentResult(
            success=result_code == '0',
            provider_reference=provider_reference,
            message=result.get('ResultDesc', 'M-Pesa STK query completed'),
            raw=result,
        )


class PayPalProvider(PaymentProvider):
    name = 'paypal'

    def _access_token(self) -> str:
        if not settings.PAYPAL_CLIENT_ID or not settings.PAYPAL_CLIENT_SECRET:
            raise RuntimeError('PayPal credentials are not configured')
        raw = f'{settings.PAYPAL_CLIENT_ID}:{settings.PAYPAL_CLIENT_SECRET}'.encode()
        auth = base64.b64encode(raw).decode()
        body = urllib.parse.urlencode({'grant_type': 'client_credentials'}).encode()
        request = urllib.request.Request(
            f'{settings.PAYPAL_BASE_URL}/v1/oauth2/token', data=body, method='POST',
            headers={'Authorization': f'Basic {auth}', 'Content-Type': 'application/x-www-form-urlencoded'},
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            result = json.loads(response.read().decode())
        return result['access_token']

    def create_payment(self, *, amount: Decimal, currency: str, reference: str,
                       metadata: dict[str, Any], request_id: str | None = None) -> PaymentResult:
        currency = currency.upper()
        if currency not in ('USD', 'EUR', 'GBP'):
            return PaymentResult(False, message='PayPal listing payments require a supported PayPal currency')
        headers = {'Authorization': f'Bearer {self._access_token()}'}
        if request_id:
            headers['PayPal-Request-Id'] = request_id[:25]
        order = _request_json(
            f'{settings.PAYPAL_BASE_URL}/v2/checkout/orders', method='POST',
            data={'intent': 'CAPTURE', 'purchase_units': [{'reference_id': reference,
                'amount': {'currency_code': currency, 'value': f'{Decimal(amount):.2f}'}}]},
            headers=headers,
        )
        return PaymentResult(True, provider_reference=order.get('id'), message='PayPal order created', raw=order)

    def verify_payment(self, *, provider_reference: str) -> PaymentResult:
        """Read the PayPal order state without mutating provider state."""
        result = _request_json(
            f'{settings.PAYPAL_BASE_URL}/v2/checkout/orders/{urllib.parse.quote(provider_reference, safe="")}',
            method='GET', headers={'Authorization': f'Bearer {self._access_token()}'},
        )
        status = result.get('status')
        return PaymentResult(status in ('APPROVED', 'COMPLETED'), provider_reference=provider_reference,
                             message=f'PayPal order status: {status}', raw=result)

    def capture_payment(self, *, order_id: str, request_id: str | None = None) -> PaymentResult:
        """Capture an approved PayPal order with a stable idempotency key."""
        headers = {'Authorization': f'Bearer {self._access_token()}'}
        if request_id:
            headers['PayPal-Request-Id'] = request_id[:25]
        result = _request_json(
            f'{settings.PAYPAL_BASE_URL}/v2/checkout/orders/{urllib.parse.quote(order_id, safe="")}/capture',
            method='POST', headers=headers,
        )
        status = result.get('status')
        return PaymentResult(status == 'COMPLETED', provider_reference=order_id,
                             message=f'PayPal order status: {status}', raw=result)


def get_provider(name: str) -> PaymentProvider:
    providers = {'mpesa': MpesaProvider(), 'paypal': PayPalProvider()}
    try:
        return providers[name.lower()]
    except KeyError as exc:
        raise ValueError(f'Unsupported payment provider: {name}') from exc
