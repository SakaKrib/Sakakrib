from celery import shared_task

from .email_services import send_notification_email
from .listing_payment_notification_services import queue_listing_payment_success_email


@shared_task(bind=True, autoretry_for=(Exception,), retry_backoff=True, retry_kwargs={'max_retries': 5})
def send_listing_payment_success_email(self, payment_id):
    email = queue_listing_payment_success_email(payment_id)
    if not email:
        return {'sent': False, 'reason': 'payment or recipient not found'}
    if email.status == 'sent':
        return {'sent': True, 'already_sent': True, 'email_id': str(email.id)}
    result = send_notification_email(email)
    return {'sent': True, 'email_id': str(email.id), 'result': result}
