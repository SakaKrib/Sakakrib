from celery import shared_task
from django.db import transaction

from .models import Profile


OTP_ACCOUNT_CLEANUP_DELAY_SECONDS = 180


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_kwargs={"max_retries": 3},
)
def delete_unverified_account_after_3_minutes(self, user_id):
    """Delete a registration account that is still unverified after 3 minutes.

    The task is intentionally idempotent: a verified account, an already-deleted
    account, or an account that has progressed beyond the pending verification
    state is left untouched.
    """
    with transaction.atomic():
        user = (
            Profile.objects.select_for_update()
            .filter(id=user_id)
            .first()
        )

        if user is None:
            return {"deleted": False, "reason": "account_not_found"}

        if user.email_verified:
            return {"deleted": False, "reason": "email_verified"}

        # Only remove accounts that are demonstrably still in the temporary
        # signup/verification state. Do not use email_verified=False alone,
        # because an unverified flag can exist on accounts that have otherwise
        # progressed through the application lifecycle.
        if user.verification_status != "pending_verification":
            return {"deleted": False, "reason": "account_progressed"}

        if user.signup_verification_started_at is None:
            return {"deleted": False, "reason": "not_in_signup_flow"}

        if user.signup_otp_verified_at is not None:
            return {"deleted": False, "reason": "otp_verified_state"}

        user.delete()
        return {"deleted": True, "reason": "unverified_after_3_minutes"}
