from celery import shared_task

from .moving_payment_email_services import queue_moving_payment_emails


@shared_task(bind=True, autoretry_for=(Exception,), retry_backoff=True, retry_kwargs={"max_retries": 5})
def send_moving_payment_emails(self, payment_id):
    return queue_moving_payment_emails(payment_id)
