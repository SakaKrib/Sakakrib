"""Migration phase marker for the Supabase -> Django backend migration.

This module intentionally contains no runtime behavior. It records the
migration strategy in source so the branch remains self-documenting while
production behavior is reconciled into Django.
"""

MIGRATION_SOURCE_PRIORITY = (
    "live_supabase_production_state",
    "supabase_migration_history",
    "frontend_api_contract",
    "existing_django_implementation",
)

TARGET_BACKEND = "django"
TARGET_DATABASE = "postgresql"
SUPABASE_RUNTIME_DEPENDENCY = False
