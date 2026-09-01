# SakaCrib Supabase → Django Migration Source of Truth

## Decision

SakaCrib is migrating to a **Django-owned PostgreSQL backend**. Supabase is a migration/reference system only and must not remain a runtime dependency after cutover.

We use a **hybrid evidence method**:

1. **Live Supabase production database** is the authoritative source for the current production state.
2. **Supabase migration files** are the authoritative historical record of how that state was introduced and changed.
3. **Frontend Git code** is the authoritative reference for API inputs, outputs, UI workflows, and user-visible behavior.
4. **Existing Django code** is retained where it matches production behavior, but is not assumed correct until reconciled.
5. **Django models + Django migrations** become the authoritative schema after reconciliation and cutover.

## Non-negotiable target

After migration:

```text
React frontend
    ↓
Django REST API
    ↓
Django services / authorization
    ↓
Django-owned PostgreSQL
```

There must be no production dependency on:

- Supabase database
- Supabase Auth
- Supabase RLS
- Supabase RPC functions
- Supabase triggers
- Supabase Storage
- Supabase Edge Functions

External providers such as M-Pesa, PayPal, email, maps, AI, and the selected storage provider remain external integrations where required.

## Reconciliation rules

### Schema

For every production table, compare:

```text
Supabase migration history
        ↕
Live Supabase schema
        ↕
Current Django model/migration
```

The live schema wins when the historical migration chain and live state differ, unless the difference is demonstrably accidental and is explicitly corrected as part of the migration plan.

### Functions

Every production function is classified as one of:

- Django domain/application service
- Django API endpoint
- Django scheduled task
- PostgreSQL constraint/trigger retained in the new database
- Utility code
- Supabase-specific infrastructure that is intentionally replaced

We preserve **observable behavior**, transaction boundaries, authorization, validation, state transitions, idempotency, and return semantics rather than copying PostgreSQL syntax literally.

### RLS

Every production RLS policy must have an explicit Django authorization equivalent. `IsAuthenticated` alone is not considered equivalent to RLS.

### Triggers

Every production trigger must be explicitly classified and tested. Financial/security/integrity triggers are not silently dropped.

### Data

Production UUIDs and relationships should be preserved during data migration wherever possible. Data migration occurs only after the target schema and behavior are ready.

## Migration phases

1. Inventory live production schema, functions, triggers, policies, indexes and constraints.
2. Reconcile against the Supabase migration chain.
3. Reconcile against the frontend workflows and current Django branch.
4. Correct/complete Django models.
5. Generate the authoritative Django migration chain.
6. Implement Django authentication and authorization.
7. Implement domain services for production RPC/function behavior.
8. Implement/retain required database integrity mechanisms.
9. Implement external-provider integrations and scheduled jobs.
10. Migrate production data into a separate Django PostgreSQL database.
11. Run parity tests against representative production workflows.
12. Switch the frontend to Django.
13. Verify production health before retiring Supabase runtime dependencies.

## Current stop condition

Do **not** run the existing incomplete Django migration chain as a production migration. It is a work-in-progress foundation and must first be reconciled with the production schema.

## Critical parity domains

- Authentication / signup OTP / sessions
- KYC and verification
- Role and application approvals
- Listings and listing entitlement/payment
- Landlord subscriptions and expiry/grace period
- Real-estate listing workflows
- Mover applications and approval
- Mover quotes and booking lifecycle
- Moving payments, escrow and payouts
- Booking scheduling/tracking/delivery/disputes/cancellation
- Chat and canonical booking conversations
- Notifications and email queueing
- PMS/property units
- Renter-unit associations
- Rent invoices, intents, submissions and payments
- Reviews
- Support/admin workflows
- Platform settings and terms acceptance

## Definition of done

The migration is not considered complete merely because Django migrations apply successfully. It is complete when:

- the target Django database contains the required production schema;
- production data is migrated and relationally consistent;
- each production security rule has an equivalent Django control;
- each production business workflow has a Django implementation;
- payment operations are idempotent and transaction-safe;
- scheduled lifecycle operations are implemented;
- frontend workflows work against Django without Supabase runtime dependencies;
- parity tests pass for the critical domains above.
