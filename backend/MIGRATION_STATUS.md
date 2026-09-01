# SakaKrib Django migration

## Branch lock

All Django migration work is performed only on `django-backend-migration`.

## Source of truth during migration

The existing Supabase schema, functions, triggers, RLS policies, Edge Functions, and frontend contracts are retained as behavioral/reference material. The Django API must preserve those rules before a production cutover.

## Implemented in this phase

- Django/DRF project configuration
- PostgreSQL/Supabase PostgreSQL environment configuration
- Supabase JWT authentication from Authorization header or HttpOnly cookie
- Profile/role projection
- Role-aware permissions
- Listing model projection with the fields used by the canonical listing creation function
- Subscription plan, landlord subscription, real-estate subscription, and subscription-listing projections
- Listing entitlement service: verification/application gates, three free listings, subscription capacity, and KES 1,000 individual listing path
- PMS restriction before listing insertion
- Listing creation API
- Listing payment-intent API
- Authenticated `/api/accounts/me/` endpoint
- `/api/listings/entitlement/` endpoint
- `/health/` endpoint

## Important migration rule

These initial domain models use `managed = False` because the existing Supabase database remains authoritative while the Django application is being reconciled. Do not run destructive Django migrations against the existing Supabase schema.

The next phases will add the remaining domain projections and transactional services (payments, movers, bookings, PMS, rent, chat, notifications), followed by integration tests and controlled frontend API migration.
