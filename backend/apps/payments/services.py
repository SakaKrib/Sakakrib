from dataclasses import dataclass
from decimal import Decimal
from typing import Any


@dataclass(frozen=True)
class PaymentResult:
    success: bool
    provider_reference: str | None = None
    message: str = ''
    raw: dict[str, Any] | None = None


class PaymentProvider:
    name = 'base'

    def create_payment(self, *, amount: Decimal, currency: str, reference: str, metadata: dict[str, Any]) -> PaymentResult:
        raise NotImplementedError

    def verify_payment(self, *, provider_reference: str) -> PaymentResult:
        raise NotImplementedError


class MpesaProvider(PaymentProvider):
    name = 'mpesa'

    def create_payment(self, *, amount: Decimal, currency: str, reference: str, metadata: dict[str, Any]) -> PaymentResult:
        """Provider boundary for Daraja STK Push.

        The HTTP/Daraja implementation belongs here; credentials and callback URLs
        must come from environment variables. No payment is considered successful
        merely because an STK request was accepted.
        """
        raise NotImplementedError('M-Pesa provider transport is not configured yet')

    def verify_payment(self, *, provider_reference: str) -> PaymentResult:
        raise NotImplementedError('M-Pesa verification transport is not configured yet')


class PayPalProvider(PaymentProvider):
    name = 'paypal'

    def create_payment(self, *, amount: Decimal, currency: str, reference: str, metadata: dict[str, Any]) -> PaymentResult:
        """Provider boundary for PayPal Orders/subscription APIs."""
        raise NotImplementedError('PayPal provider transport is not configured yet')

    def verify_payment(self, *, provider_reference: str) -> PaymentResult:
        raise NotImplementedError('PayPal verification transport is not configured yet')


def get_provider(name: str) -> PaymentProvider:
    providers = {'mpesa': MpesaProvider(), 'paypal': PayPalProvider()}
    try:
        return providers[name.lower()]
    except KeyError as exc:
        raise ValueError(f'Unsupported payment provider: {name}') from exc
