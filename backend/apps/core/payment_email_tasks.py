from celery import shared_task
from django.db import transaction

from .domain_platform import NotificationEmail
from .email_services import send_notification_email
from .payment_notification_services import queue_payment_success_email


@shared_task(bind=True, autoretry_for=(Exception,), retry_backoff=True, retry_kwargs={'max_retries': 5})
def send_payment_success_email(self, invoice_id, provider):
    email = queue_payment_success_email(invoice_id, provider)
    if email is None:
        return {'sent': False, 'reason': 'invoice_or_recipient_not_available'}
    if email.status == 'sent':
        return {'sent': True, 'already_sent': True, 'notification_id': str(email.id)}
    return send_notification_email(email)
