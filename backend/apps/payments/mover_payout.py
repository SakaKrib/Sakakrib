from decimal import Decimal

from django.conf import settings

from .services import PaymentResult, _request_json


class MpesaMoverPayoutProvider:
    """Daraja B2C provider for releasing a mover's net earnings."""

    name = "MPESA"

    def _access_token(self) -> str:
        import base64

        key = settings.MPESA_CONSUMER_KEY
        secret = settings.MPESA_CONSUMER_SECRET
        if not key or not secret:
            raise RuntimeError("M-Pesa credentials are not configured")
        credentials = base64.b64encode(f"{key}:{secret}".encode()).decode()
        result = _request_json(
            f"{settings.MPESA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials",
            headers={"Authorization": f"Basic {credentials}"},
        )
        token = result.get("access_token")
        if not token:
            raise RuntimeError("M-Pesa did not return an access token")
        return token

    @staticmethod
    def _phone(value: str) -> str:
        phone = "".join(ch for ch in str(value or "") if ch.isdigit())
        if phone.startswith("0") and len(phone) == 10:
            phone = "254" + phone[1:]
        elif phone.startswith("7") or phone.startswith("1"):
            phone = "254" + phone
        if not phone.startswith("254") or len(phone) != 12:
            raise ValueError("Mover payout phone number must be a valid Kenyan mobile number")
        return phone

    def send(self, *, amount: Decimal, phone_number: str, reference: str) -> PaymentResult:
        callback = getattr(settings, "MPESA_PAYOUT_RESULT_URL", "")
        initiator = getattr(settings, "MPESA_PAYOUT_INITIATOR_NAME", "")
        security_credential = getattr(settings, "MPESA_PAYOUT_SECURITY_CREDENTIAL", "")
        command_id = getattr(settings, "MPESA_PAYOUT_COMMAND_ID", "BusinessPayment")
        if not all((callback, initiator, security_credential)):
            raise RuntimeError("M-Pesa payout callback URL, initiator name, and security credential must be configured")

        amount = Decimal(amount).quantize(Decimal("0.01"))
        if amount <= 0:
            raise ValueError("Mover payout amount must be greater than zero")
        phone = self._phone(phone_number)
        token = self._access_token()
        payload = {
            "InitiatorName": initiator,
            "SecurityCredential": security_credential,
            "CommandID": command_id,
            "Amount": int(amount),
            "PartyA": settings.MPESA_SHORTCODE,
            "PartyB": phone,
            "Remarks": f"Saka Krib mover payout {reference}"[:100],
            "QueueTimeOutURL": callback,
            "ResultURL": callback,
            "Occasion": reference[:100],
        }
        result = _request_json(
            f"{settings.MPESA_BASE_URL}/mpesa/b2c/v1/paymentrequest",
            method="POST",
            data=payload,
            headers={"Authorization": f"Bearer {token}"},
        )
        code = str(result.get("ResponseCode", ""))
        provider_reference = result.get("OriginatorConversationID") or result.get("ConversationID")
        return PaymentResult(
            success=code == "0" and bool(provider_reference),
            provider_reference=provider_reference,
            message=result.get("ResponseDescription", "M-Pesa payout request submitted"),
            raw=result,
        )
