from django.core.exceptions import ValidationError
from django.test import SimpleTestCase

from .moving_payment_services import _normalize_mpesa_phone


class MovingMpesaPhoneTests(SimpleTestCase):
    def test_normalizes_common_kenyan_formats(self):
        self.assertEqual(_normalize_mpesa_phone("0712 345 678"), "254712345678")
        self.assertEqual(_normalize_mpesa_phone("+254712345678"), "254712345678")
        self.assertEqual(_normalize_mpesa_phone("712345678"), "254712345678")
        self.assertEqual(_normalize_mpesa_phone("0112345678"), "254112345678")

    def test_rejects_invalid_phone_number(self):
        with self.assertRaisesMessage(ValidationError, "Enter a valid Kenyan M-Pesa phone number"):
            _normalize_mpesa_phone("12345")
