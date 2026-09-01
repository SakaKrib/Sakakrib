# SakaKrib Django Backend

This directory contains the Django/DRF backend for SakaKrib.

## Architecture

- `frontend/` — React/Vite client (planned relocation; existing frontend remains untouched during backend bootstrap)
- `backend/` — Django + Django REST Framework backend
- `supabase/` — legacy/database migration source material retained for reconciliation
- `docs/migration/` — migration audit and schema documentation

## Migration rule

The Django backend is being built from the authoritative Supabase schema/business rules. Do not delete or alter the Supabase migration history as part of backend development.

## Initial backend goals

1. Establish Django project configuration.
2. Connect Django to PostgreSQL/Supabase PostgreSQL using environment variables.
3. Model the existing domain incrementally.
4. Reproduce authorization and business rules in Django services/API permissions.
5. Add tests before replacing production flows.
