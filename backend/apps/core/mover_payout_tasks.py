from celery import shared_task
from django.db import transaction
from django.utils import timezone

from apps.payments.mover_payout import MpesaMoverPayoutProvider

from .domain_bookings import MoverPayout
from .domain_platform import Mover, UserNotification


@shared_task
def process_pending_mover_payout(payout_id):
    """Submit one admin-released payout to Daraja B2C.

    A payout is claimed by setting payout_provider before the external request.
    This prevents an ambiguous provider timeout from being retried automatically
    and potentially paying the mover twice. Such a payout remains processing for
    admin reconciliation.
    """
    with transaction.atomic():
        payout = MoverPayout.objects.select_for_update().filter(pk=payout_id).first()
        if payout is None or payout.final_payment_status != "processing":
            return {"status": "IGNORED", "reason": "Payout is not awaiting provider submission"}
        if payout.payout_provider:
            return {"status": "IGNORED", "reason": "Payout provider submission already claimed", "payout_id": str(payout.id)}

        mover = Mover.objects.filter(pk=payout.mover_id).first()
        if mover is None:
            payout.final_payment_status = "failed"
            payout.payout_failure_reason = "Mover profile not found for payout"
            payout.save(update_fields=["final_payment_status", "payout_failure_reason", "updated_at"])
            return {"status": "failed", "payout_id": str(payout.id)}

        if str(mover.payment_channel or "").lower() != "mpesa_send_money":
            payout.final_payment_status = "failed"
            payout.payout_failure_reason = "Mover payout channel is not configured for M-Pesa Send Money"
            payout.save(update_fields=["final_payment_status", "payout_failure_reason", "updated_at"])
            UserNotification.objects.create(
                user_id=mover.user_id,
                notification_type="MOVER_PAYOUT_FAILED",
                title="Mover payout needs attention",
                message="Your payout could not be sent because your configured payout channel is not supported for automatic M-Pesa payout.",
                data={"payout_id": str(payout.id), "booking_id": str(payout.booking_id)},
            )
            return {"status": "failed", "payout_id": str(payout.id)}

        if not str(mover.payment_account or mover.phone or "").strip():
            payout.final_payment_status = "failed"
            payout.payout_failure_reason = "Mover M-Pesa payout number is missing"
            payout.save(update_fields=["final_payment_status", "payout_failure_reason", "updated_at"])
            UserNotification.objects.create(
                user_id=mover.user_id,
                notification_type="MOVER_PAYOUT_FAILED",
                title="Mover payout needs attention",
                message="Your payout could not be sent because your M-Pesa payout number is missing.",
                data={"payout_id": str(payout.id), "booking_id": str(payout.booking_id)},
            )
            return {"status": "failed", "payout_id": str(payout.id)}

        payout.payout_provider = "MPESA"
        payout.save(update_fields=["payout_provider", "updated_at"])
        payout_id_value = str(payout.id)
        amount = payout.net_mover_payable
        destination = mover.payment_account or mover.phone

    try:
        result = MpesaMoverPayoutProvider().send(
            amount=amount,
            phone_number=destination,
            reference=payout_id_value,
        )
    except Exception as exc:
        # Do not automatically retry an ambiguous provider request. The request
        # may have reached Daraja even when the HTTP response was lost.
        with transaction.atomic():
            payout = MoverPayout.objects.select_for_update().filter(pk=payout_id).first()
            if payout and payout.final_payment_status == "processing":
                payout.payout_failure_reason = f"M-Pesa payout request outcome is unknown: {str(exc)[:900]}"
                payout.save(update_fields=["payout_failure_reason", "updated_at"])
                mover = Mover.objects.filter(pk=payout.mover_id).first()
                if mover:
                    UserNotification.objects.create(
                        user_id=mover.user_id,
                        notification_type="MOVER_PAYOUT_PROCESSING",
                        title="Mover payout is being reconciled",
                        message="Your payout request reached the payment-processing stage, but Saka Krib could not confirm the provider response. An administrator must reconcile the payout before another attempt is made.",
                        data={"payout_id": str(payout.id), "booking_id": str(payout.booking_id)},
                    )
        return {"status": "provider_outcome_unknown", "payout_id": payout_id_value}

    if not result.success or not result.provider_reference:
        with transaction.atomic():
            payout = MoverPayout.objects.select_for_update().filter(pk=payout_id).first()
            if payout and payout.final_payment_status == "processing":
                payout.final_payment_status = "failed"
                payout.payout_failure_reason = result.message[:1000]
                payout.save(update_fields=["final_payment_status", "payout_failure_reason", "updated_at"])
                mover = Mover.objects.filter(pk=payout.mover_id).first()
                if mover:
                    UserNotification.objects.create(
                        user_id=mover.user_id,
                        notification_type="MOVER_PAYOUT_FAILED",
                        title="Mover payout failed",
                        message="Your mover payout could not be submitted. Please contact support if the payout does not retry after administrator review.",
                        data={"payout_id": str(payout.id), "booking_id": str(payout.booking_id), "reason": result.message},
                    )
        return {"status": "failed", "payout_id": payout_id_value}

    with transaction.atomic():
        payout = MoverPayout.objects.select_for_update().filter(pk=payout_id).first()
        if payout and payout.final_payment_status == "processing":
            payout.payout_provider_reference = str(result.provider_reference)
            payout.payout_failure_reason = None
            payout.payout_requested_at = payout.payout_requested_at or timezone.now()
            payout.save(update_fields=["payout_provider_reference", "payout_failure_reason", "payout_requested_at", "updated_at"])
            mover = Mover.objects.filter(pk=payout.mover_id).first()
            if mover:
                UserNotification.objects.create(
                    user_id=mover.user_id,
                    notification_type="MOVER_PAYOUT_PROCESSING",
                    title="Mover payout submitted",
                    message=f"Your payout of KES {payout.net_mover_payable:,.2f} has been submitted to M-Pesa and is awaiting provider confirmation.",
                    data={"payout_id": str(payout.id), "booking_id": str(payout.booking_id), "provider": "MPESA", "provider_reference": str(result.provider_reference), "amount_kes": str(payout.net_mover_payable)},
                )
    return {"status": "processing", "payout_id": payout_id_value, "provider_reference": str(result.provider_reference)}


@shared_task
def process_released_mover_payouts():
    """Find admin-released payouts that have not yet been submitted to a provider."""
    payout_ids = list(
        MoverPayout.objects.filter(
            final_payment_status="processing",
            payout_provider__isnull=True,
        ).values_list("id", flat=True)[:25]
    )
    for payout_id in payout_ids:
        process_pending_mover_payout.delay(str(payout_id))
    return {"queued": len(payout_ids)}
