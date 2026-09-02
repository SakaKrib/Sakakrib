# SakaKrib Django migration

## Branch lock

All Django migration work is performed only on `django-backend-migration`.

## Architecture authority

Django/PostgreSQL is the target production authority for this migration.

The live Supabase project, exported schema, functions, triggers, RLS policies, Edge Functions, and existing frontend behavior are **reference evidence only**. They are used to discover existing data, workflows, and contracts; they are not the production business-rule authority.

If Supabase contains insecure, inconsistent, duplicated, or otherwise flawed behavior, Django must implement the corrected production behavior instead of copying the defect.

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
- Frontend Django transport now obtains and sends Django CSRF tokens for unsafe cookie-authenticated requests, including refresh and multipart uploads

### Applications and listings
- Landlord and real-estate application review endpoint
- Application review restricted to pending renter applications before role transition
- Listing model projection
- Listing creation API
- Authoritative Django listing entitlement service
- Three free listings and KES 1,000 individual paid-listing path
- Landlord/real-estate identity, KYC, and role-specific application approval gates
- Role-specific subscription plan capacities
- Subscription plan and subscription projections
- Listing payment-intent flow
- Transactional listing entitlement consumption with subscription locking
- Individual listing payments do not unlock PMS
- Real-estate property-management listings are now allowed only with an active real-estate PMS subscription, matching the landlord PMS gate without conflating the two roles

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
- Shared backend PMS access entitlement with role, verification, application-approval, subscription, and grace-period checks
- Landlord PMS dashboard/action boundary remains landlord-specific
- Dedicated real-estate PMS dashboard endpoint at `/api/pms/real-estate/dashboard/`
- Dedicated real-estate PMS mutation endpoint at `/api/pms/real-estate/action/`
- Real-estate PMS dashboard returns real-estate subscription, entitlement, subscription capacity, plans, and owner-scoped listings through Django
- Real-estate subscription-listing associations use `real_estate_subscription_id`; landlord associations continue using `subscription_id`
- Real-estate PMS listing add/remove mutations are transactionally capacity-checked and idempotent
- PMS grace-period access is read-only; expired subscriptions lose PMS access
- Existing landlord-owned rent/payment domain is intentionally not exposed as a real-estate PMS API until a real-estate ownership model is explicitly defined

### Moving
- Booking, mover, invoice, payment, payout, schedule, tracking, cancellation, and dispute projections
- Participant/owner/admin authorization scopes
- Mover quote and booking request/response/cancellation services
- Authoritative GPS distance calculation and server-side mover pricing
- Canonical renter schedule proposal and mover schedule confirmation workflow
- Moving invoice creation on mover confirmation with booking-total integrity checks
- Renter moving invoice/payment API surface
- M-Pesa moving payment lifecycle
- PayPal moving payment lifecycle and webhook verification
- Renter moving card payment controls for M-Pesa and PayPal
- Escrow release gating
- Delivery confirmation
- Dispute open/resolve lifecycle
- Mover payout callback lifecycle with shared-secret authentication

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
- Pending landlord subscription checkout is writable against the current production schema, whose period columns are non-null, while successful payment establishes the actual paid period
- Production `subscription_renewal_attempts` schema is represented in Django
- PayPal recurring subscriptions are retained for both landlord and real-estate audiences
- PayPal subscription checkout now creates the remote PayPal subscription server-side and returns its approval URL
- PayPal subscription return carries the Django invoice ID and is finalized through an authenticated Django endpoint
- PayPal subscription approval verifies the remote PayPal subscription server-side before activating the local subscription
- PayPal approval is owner-scoped to the authenticated account
- Signed PayPal subscription webhooks are verified server-side using the configured PayPal webhook ID
- Recurring subscription events are idempotently recorded through `payment_webhook_events`
- PayPal subscription activation, update, cancellation, suspension, expiry, payment failure, recurring payment, and refund events are handled by Django
- Successful recurring PayPal payments create paid subscription invoices and advance the subscription billing period
- Recurring invoice webhook IDs have a database-level uniqueness constraint
- M-Pesa subscription callbacks now query Daraja server-side before settlement; callback result code, invoice amount, receipt, and provider reference are required for successful activation
- Subscription activation occurs only after provider-confirmed payment; frontend polling never activates a subscription itself
- Subscription API exposes auto-renew, PayPal status, PayPal subscription ID, next billing time, and cancel-at-period-end state
- Subscription expiry automation runs through Celery Beat for both landlord and real-estate subscriptions

### Listing payments
- Individual KES 1,000 payment intent is owner-scoped and expires safely
- M-Pesa listing callbacks query Daraja before settlement instead of trusting the unauthenticated callback body
- PayPal listing orders are verified and captured server-side before settlement
- Listing payment settlement validates provider amount/currency/reference and is transactionally idempotent
- Individual paid listing creation does not consume a free listing entitlement

## Migration-history integrity

The accounts migration history is linear:

`0001_initial → 0002_profile_signup_verification_state → 0003_profile_indexes → 0004_refresh_tokens`

Core migration history currently ends at:

`0001_booking_domain_initial → 0002_mover_and_webhook_integrity → 0003_rent_invoice_external_verification → 0004_chat_notification_indexes → 0005_rent_production_indexes → 0006_social_support_indexes → 0007_subscription_renewal_attempts`

Subscriptions migration history is consolidated to a single `0002` leaf:

`0001_initial → 0002_entitlement_integrity`

Payments migration history is linear:

`0001_initial → 0002_production_schema_alignment`

## Still outstanding before production cutover

- Complete 44-table production schema parity audit, including every relevant column, constraint, index, trigger, and function, while applying corrected Django architecture where Supabase behavior is defective
- Verify subscription renewal automation end-to-end for both M-Pesa and PayPal, including provider-confirmed renewal, invoice creation, grace handling, and retry semantics
- Configure production PayPal subscription return/cancel URLs and verify PayPal plan IDs for every supported plan
- Finish listing API/read/search parity
- Complete persistent production object-storage architecture and authorization for KYC, profile, listing, and chat media
- Migrate remaining frontend transport domain-by-domain from Supabase to Django
- Remove the transitional `protected-api`/Supabase application-data bridge after equivalent Django endpoints are verified
- Finish ChatPage transport migration after Django chat APIs/WebSocket contracts are verified
- Verify external mover payout initiation/provider integration
- Reconcile remaining moving lifecycle edge cases and dispute financial settlement behavior
- Complete rent automated M-Pesa/PayPal payment parity where required by the target architecture
- Define and implement any additional real-estate PMS domains only when the frontend/business contract requires them; do not reuse landlord-owned rent models merely to claim parity
- Run backend migration checks, unit/integration tests, and CI in the project environment
- Perform controlled data migration and cutover rehearsal
- Remove Supabase runtime dependencies only after backend and frontend parity is verified

## Intentionally deferred

The frontend remains hybrid during migration. Existing Supabase transport is retained only where the equivalent Django contract has not yet been verified. No transitional Supabase path should be removed merely because a Django model exists; the replacement must be tested end-to-end first.
