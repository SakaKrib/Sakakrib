# SakaKrib Django migration

## Branch lock

All Django migration work is performed only on `django-backend-migration`.

## Migration source of truth

During the migration, the live Supabase schema, functions, triggers, RLS policies, Edge Functions, and frontend contracts are treated as the behavioral reference. Django must reproduce the effective business rules before production cutover.

Do not modify or destructively migrate the live Supabase production database from this branch.

## Implemented

### Foundation and auth
- Django/DRF configuration and PostgreSQL integration
- Supabase-compatible JWT verification during transition
- HttpOnly cookie authentication
- Profile/role projection
- Role-aware authorization helpers
- Signup OTP/KYC verification state
- Refresh-token persistence and rotation support
- Authenticated `/api/accounts/me/`
- CSRF and health endpoints

### Applications and listings
- Landlord and real-estate application review endpoint
- Application review restricted to pending renter applications before role transition
- Listing model projection
- Listing creation API
- Listing entitlement service
- Three free listings and KES 1,000 paid-listing path
- Landlord/real-estate approval gates
- Subscription plan and subscription projections
- Listing payment-intent flow

### PMS and rent
- Property units and renter associations
- Renter invitation creation, preview, claim, and resend
- Landlord rent invoice creation
- Renter external-payment submission
- Renter-paid invoice creation
- Landlord payment confirmation/rejection
- Production rent indexes and uniqueness protections
- Landlord rent-payment reminder endpoint
- Rent reminder configuration/scheduled-reminder model projection

### Moving
- Booking, mover, invoice, payment, payout, schedule, tracking, cancellation, and dispute projections
- Participant/owner/admin authorization scopes
- Mover quote and booking request/response/cancellation services
- M-Pesa moving payment lifecycle
- PayPal moving payment lifecycle and webhook verification
- Escrow release gating
- Delivery confirmation
- Dispute open/resolve lifecycle
- Mover payout callback lifecycle

### Chat and notifications
- Participant-scoped chat history/send API
- Django Channels WebSocket transport
- Private chat-media upload and signed URLs
- User notification dispatch with event-key idempotency
- Notification email queue processor
- Notification read/delete API

### Community, reviews, support, terms
- Community post CRUD with published-listing visibility rules
- Review CRUD and public filtering
- Anonymous/authenticated support-ticket creation
- Owner/admin support-ticket access and admin resolution updates
- Terms-acceptance owner-scoped CRUD
- Production indexes for these domains

### Subscription reconciliation
- Real-estate and landlord subscription access require the corresponding approved application plus verified identity before listing entitlement is granted
- Subscription checkout blocks unapproved real-estate applications as well as unapproved landlord applications
- Django subscription views use the custom `Profile` request user directly; no invalid `request.user.profile` dereference
- Pending landlord subscription checkout is writable against the current production schema, whose period columns are non-null, while successful payment still establishes the real paid period
- Production `subscription_renewal_attempts` schema is now represented in Django
- PayPal recurring subscriptions are retained for both landlord and real-estate audiences
- PayPal subscription approval now verifies the remote PayPal subscription server-side before activating the local subscription
- Signed PayPal subscription webhooks are verified server-side using the configured PayPal webhook ID
- Recurring subscription events are idempotently recorded through `payment_webhook_events`
- PayPal subscription activation, update, cancellation, suspension, expiry, payment failure, recurring payment, and refund events are handled by Django
- Successful recurring PayPal payments create paid subscription invoices and advance the subscription billing period
- Recurring invoice webhook IDs have a database-level uniqueness constraint
- Subscription API exposes auto-renew, PayPal status, PayPal subscription ID, next billing time, and cancel-at-period-end state

## Migration-history integrity

The accounts migration history was consolidated to a single linear path:

`0001_initial → 0002_profile_signup_verification_state → 0003_profile_indexes → 0004_refresh_tokens`

Duplicate migration branches were removed so Django does not encounter conflicting `0002`/`0003` leaves.

Core migration history currently ends at:

`0001_booking_domain_initial → 0002_mover_and_webhook_integrity → 0003_rent_invoice_external_verification → 0004_chat_notification_indexes → 0005_rent_production_indexes → 0006_social_support_indexes → 0007_subscription_renewal_attempts`

Subscriptions migration history currently ends at:

`0001_initial → 0002_paypal_recurring_webhook_idempotency`

## Still outstanding before production cutover

- Complete 44-table production schema parity audit, including every column, constraint, index, trigger, and function
- Reconcile subscription expiry/grace behavior and automation against the effective production schedule, including the exact renewal automation semantics
- Finish listing API/read/search parity
- Verify exact mover payout provider callback authentication against production
- Reconcile remaining moving lifecycle edge cases and dispute financial settlement behavior
- Implement/verify remaining rent reminder scheduling automation
- Migrate frontend transport domain-by-domain from Supabase to Django
- Run backend migration checks, unit/integration tests, and CI
- Perform controlled data migration and cutover rehearsal
- Remove Supabase dependencies only after backend and frontend parity is verified

## Intentionally deferred

`ChatPage.tsx` frontend transport migration is intentionally deferred until the backend domain integration is complete. Do not replace the existing ChatPage transport prematurely; revisit it after the remaining backend domains and API contracts are reconciled.