# SakaCrib Django Migration Source of Truth

## Decision

SakaCrib is now being cut over to a **Django-owned PostgreSQL backend**. The former Supabase system was used as migration/reference evidence only and is not a runtime dependency.

We used a **hybrid evidence method during migration**:

1. The former production database was used as authoritative evidence for the production state.
2. Historical migration/function/policy/trigger records were used to reconstruct behavior and schema changes.
3. Frontend Git code is the authoritative reference for API inputs, outputs, UI workflows, and user-visible behavior.
4. Existing Django code is retained where it matches production behavior, but is not assumed correct until reconciled.
5. **Django models + Django migrations are the authoritative schema after reconciliation and cutover.**

## Target architecture

```text
React frontend
    ↓
Django REST API
    ↓
Django services / authorization
    ↓
Django-owned PostgreSQL
```

There must be no production dependency on the former hosted backend services for:

- database access
- authentication
- row-level security
- RPC functions
- triggers
- storage
- edge/serverless functions

External providers such as M-Pesa, PayPal, email, maps, AI, Redis, and the selected Django media storage remain external integrations where required.

## Reconciliation rules

### Schema

For every production table, compare the historical production evidence with the current Django model and migration chain. The reconciled Django schema is authoritative after cutover.

### Functions

Every former production function is classified as one of:

- Django domain/application service
- Django API endpoint
- Django scheduled task
- PostgreSQL constraint/trigger retained in the new database
- Utility code
- Infrastructure that is intentionally replaced

We preserve **observable behavior**, transaction boundaries, authorization, validation, state transitions, idempotency, and return semantics rather than copying the previous platform's implementation literally.

### Authorization

Every former row-level security rule must have an explicit Django authorization equivalent. `IsAuthenticated` alone is not considered equivalent to object-level authorization.

### Integrity mechanisms

Financial, security, and data-integrity rules must be explicitly represented by Django validation, service-layer transaction boundaries, database constraints, or scheduled jobs as appropriate.

### Data

Production UUIDs and relationships should be preserved during data migration wherever possible. Data migration occurs only after the target schema and behavior are ready.

## Migration phases

1. Inventory production schema, functions, triggers, policies, indexes and constraints.
2. Reconcile historical production evidence.
3. Reconcile against frontend workflows and current Django code.
4. Correct/complete Django models.
5. Generate the authoritative Django migration chain.
6. Implement Django authentication and authorization.
7. Implement domain services for former RPC/function behavior.
8. Implement required database integrity mechanisms.
9. Implement external-provider integrations and scheduled jobs.
10. Migrate production data into the Django PostgreSQL database.
11. Run parity tests against representative production workflows.
12. Switch the frontend to Django.
13. Verify production health and retire the former hosted backend runtime.

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

The migration is complete when:

- the target Django database contains the required production schema;
- production data is migrated and relationally consistent;
- each former security rule has an equivalent Django control;
- each required business workflow has a Django implementation;
- payment operations are idempotent and transaction-safe;
- scheduled lifecycle operations are implemented;
- frontend workflows work against Django without the former hosted backend runtime;
- parity tests pass for the critical domains above.
