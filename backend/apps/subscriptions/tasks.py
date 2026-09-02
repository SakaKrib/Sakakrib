from celery import shared_task

from .expiry import process_subscription_expiry


@shared_task(bind=True, autoretry_for=(Exception,), retry_backoff=True, retry_kwargs={'max_retries': 3})
def process_subscription_expiry_task(self):
    return process_subscription_expiry()
