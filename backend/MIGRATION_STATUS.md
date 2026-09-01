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

## Migration-history integrity

The accounts migration history was consolidated to a single linear path:

`0001_initial → 0002_profile_signup_verification_state → 0003_profile_indexes → 0004_refresh_tokens`

Duplicate migration branches were removed so Django does not encounter conflicting `0002`/`0003` leaves.

Core migration history currently ends at:

`0001_booking_domain_initial → 0002_mover_and_webhook_integrity → 0003_rent_invoice_external_verification → 0004_chat_notification_indexes → 0005_rent_production_indexes → 0006_social_support_indexes`

## Still outstanding before production cutover

- Complete 44-table production schema parity audit, including every column, constraint, index, trigger, and function
- Reconcile remaining real-estate subscription behavior and renewal automation
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
