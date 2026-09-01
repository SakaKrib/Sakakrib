# Production Schema Reconciliation

## Source hierarchy

1. Live Supabase production schema — current deployed state.
2. Supabase migration history — historical intent and behavior.
3. Frontend Git code — API/data contract actually consumed by the application.
4. Existing Django implementation — preserved where compatible, corrected where it diverges.

## Current verified production invariants

- `profiles.verification_status` defaults to `unverified`.
- `profiles` contains signup OTP/verfication lifecycle fields and landlord, mover, and real-estate application status fields.
- `listings` contains AI caption fields and separate approval/publication/payment state.
- `listing_payment_intents.amount_kes` is exactly `1000.00` and intents expire after 15 minutes.
- `listing_payments.checkout_request_id` and `provider_reference` are unique when present.
- `bookings` stores server-authoritative distance/rate/base/commission/total values and has an explicit payment/status state machine.
- `movers.user_id`, `mover_payouts.booking_id`, `mover_schedule_events.booking_id`, `moving_invoices.booking_id`, and relevant provider identifiers require uniqueness/idempotency where defined in production.
- subscription states and billing cycles are constrained; real-estate subscriptions additionally support `PAST_DUE`.
- rent payment periods are constrained to valid calendar months; payment/provider states are constrained.
- `platform_settings.id` is intentionally a boolean primary key constrained to `TRUE`.
- payment webhook processing is backed by an idempotency ledger.
- Supabase `auth.users` foreign keys are a migration boundary: the Django target must replace them with the Django user/profile identity without losing UUIDs.

## Migration rule

Do not run the incomplete Django migration chain as the final production schema. Reconcile models first, then generate the authoritative Django migrations. Existing UUIDs must remain stable for data migration and API compatibility.
