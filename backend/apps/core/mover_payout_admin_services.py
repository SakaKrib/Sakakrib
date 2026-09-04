from django.core.exceptions import ValidationError
from django.db import transaction

from apps.accounts.authorization import require_admin

from .domain_bookings import MoverPayout


@transaction.atomic
def retry_failed_mover_payout(*, admin_user_id, payout_id):
    """Re-queue only a definitively failed payout after administrator review.

    A payout with a provider reference is never reset here because the provider
    may still settle it asynchronously. Only failed submissions without a
    provider reference can be safely returned to the normal processor queue.
    """
    from apps.accounts.models import User

    admin_user = User.objects.filter(pk=admin_user_id).first()
    if admin_user is None:
        raise ValidationError("Administrator account not found")
    require_admin(admin_user)

    payout = MoverPayout.objects.select_for_update().filter(pk=payout_id).first()
    if payout is None:
        raise ValidationError("Mover payout not found")
    if payout.final_payment_status != "failed":
        raise ValidationError("Only failed mover payouts can be retried")
    if payout.payout_provider_reference:
        raise ValidationError(
            "This payout has a provider reference and cannot be retried automatically. Reconcile the provider result first."
        )

    payout.final_payment_status = "processing"
    payout.payout_provider = None
    payout.payout_provider_transaction_id = None
    payout.payout_failure_reason = None
    payout.payout_requested_at = None
    payout.payout_completed_at = None
    payout.save(update_fields=[
        "final_payment_status",
        "payout_provider",
        "payout_provider_transaction_id",
        "payout_failure_reason",
        "payout_requested_at",
        "payout_completed_at",
        "updated_at",
    ])

    return {
        "status": "QUEUED",
        "payout_id": str(payout.id),
        "booking_id": str(payout.booking_id),
        "net_mover_payable": str(payout.net_mover_payable),
    }
