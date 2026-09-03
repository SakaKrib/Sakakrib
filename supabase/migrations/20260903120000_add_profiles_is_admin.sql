-- Add is_admin flag to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

-- Backfill from existing role values (if any admins exist)
UPDATE profiles
SET is_admin = true
WHERE role = 'admin';

-- Ensure column exists for future use
ALTER TABLE profiles
  ALTER COLUMN is_admin SET DEFAULT false;
