"""Payment queryset scopes derived from the audited Supabase RLS policies."""

from .models import ListingPayment


def listing_payment_intents_for_user(user):
    from apps.listings.models import ListingPaymentIntent

    return ListingPaymentIntent.objects.filter(user_id=user.pk)


def listing_payments_for_user(user):
    # Production RLS exposes listing payments by user_id only. Do not broaden
    # this to admin here; privileged administrative workflows should use an
    # explicit server-side service boundary rather than bypassing this scope.
    return ListingPayment.objects.filter(user_id=user.pk)
