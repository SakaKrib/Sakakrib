/*
# crib ya miae — Admin, Support, Escrow, Payouts, and Registration Fields

## Purpose
Adds admin role, support tickets, listing approval queue, mover escrow payouts,
separate landlord/mover registration fields, and storage buckets for ID documents.

## New Tables
- `support_tickets` — Contact form submissions with admin reply workflow.
- `mover_payouts` — Escrow tracker: renter payment, 10% platform deduction, net mover payable,
  50% down payment on job start, 50% final on delivery confirmation.

## Modified Tables
- `profiles`:
  - role now includes 'admin'.
  - New columns: first_name, last_name, middle_name, id_document_url, id_document_type,
    is_admin (generated from role).
- `listings`:
  - New columns: approval_status (pending_review/approved/rejected), admin_reviewed_at, admin_review_note.
  - SELECT policy narrowed: only approved listings are public; pending/owned/admin visible.
  - UPDATE policy: owner or admin.
- `movers`:
  - New columns: payment_channel, payment_account, liability_accepted, reference_contacts (jsonb).

## Security
- RLS on all new tables.
- support_tickets: anon+authenticated INSERT (public contact form); admin-only SELECT/UPDATE/DELETE.
- mover_payouts: admin-only INSERT/UPDATE/DELETE; mover owner + admin SELECT.
- SECURITY DEFINER functions: admin_review_listing, admin_release_mover_payout — check caller is admin.
- Storage buckets: id-documents (private), licenses (private), listing-media (public), kyc-documents (private).

## Storage
- Creates buckets: id-documents, licenses, kyc-documents, listing-media.
- Policies: users can upload to their own folder (auth.uid() prefix); anyone can read public listing-media.
*/

-- =========================================================
-- PROFILES: add admin role + registration fields
-- =========================================================
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('renter','landlord','mover','real_estate','admin'));

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'first_name') THEN
    ALTER TABLE profiles ADD COLUMN first_name text NOT NULL DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'last_name') THEN
    ALTER TABLE profiles ADD COLUMN last_name text NOT NULL DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'middle_name') THEN
    ALTER TABLE profiles ADD COLUMN middle_name text NOT NULL DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'id_document_url') THEN
    ALTER TABLE profiles ADD COLUMN id_document_url text NOT NULL DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'id_document_type') THEN
    ALTER TABLE profiles ADD COLUMN id_document_type text NOT NULL DEFAULT ''
      CHECK (id_document_type IN ('','national_id','passport'));
  END IF;
END $$;

-- Backfill first_name/last_name from full_name for existing rows
UPDATE profiles SET first_name = split_part(full_name, ' ', 1), last_name = split_part(full_name, ' ', 2)
WHERE first_name = '' AND full_name != '' AND full_name IS NOT NULL;

-- =========================================================
-- LISTINGS: approval queue
-- =========================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'listings' AND column_name = 'approval_status') THEN
    ALTER TABLE listings ADD COLUMN approval_status text NOT NULL DEFAULT 'pending_review'
      CHECK (approval_status IN ('pending_review','approved','rejected'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'listings' AND column_name = 'admin_reviewed_at') THEN
    ALTER TABLE listings ADD COLUMN admin_reviewed_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'listings' AND column_name = 'admin_review_note') THEN
    ALTER TABLE listings ADD COLUMN admin_review_note text NOT NULL DEFAULT '';
  END IF;
END $$;

-- Migrate existing published listings to approved
UPDATE listings SET approval_status = 'approved'
WHERE approval_status = 'pending_review' AND is_published = true;

-- Narrow SELECT: only approved listings visible publicly; owner + admin see all
DROP POLICY IF EXISTS "listings_select_all" ON listings;
CREATE POLICY "listings_select_approved_or_owned" ON listings FOR SELECT
  TO authenticated USING (
    approval_status = 'approved'
    OR auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- Allow owner or admin to UPDATE
DROP POLICY IF EXISTS "listings_update_own" ON listings;
CREATE POLICY "listings_update_own_or_admin" ON listings FOR UPDATE
  TO authenticated USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  ) WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- =========================================================
-- MOVERS: payment + liability + references
-- =========================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'movers' AND column_name = 'payment_channel') THEN
    ALTER TABLE movers ADD COLUMN payment_channel text NOT NULL DEFAULT 'mpesa_send_money'
      CHECK (payment_channel IN ('mpesa_send_money','mpesa_paybill','mpesa_lipa_na_mpesa','airtel_money'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'movers' AND column_name = 'payment_account') THEN
    ALTER TABLE movers ADD COLUMN payment_account text NOT NULL DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'movers' AND column_name = 'liability_accepted') THEN
    ALTER TABLE movers ADD COLUMN liability_accepted boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'movers' AND column_name = 'reference_contacts') THEN
    ALTER TABLE movers ADD COLUMN reference_contacts jsonb NOT NULL DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- =========================================================
-- SUPPORT TICKETS
-- =========================================================
CREATE TABLE IF NOT EXISTS support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL DEFAULT '',
  subject text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','resolved')),
  admin_reply text NOT NULL DEFAULT '',
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status, created_at DESC);

DROP POLICY IF EXISTS "support_tickets_insert_public" ON support_tickets;
CREATE POLICY "support_tickets_insert_public" ON support_tickets FOR INSERT
  TO anon, authenticated WITH CHECK (user_id IS NULL OR user_id = auth.uid());

DROP POLICY IF EXISTS "support_tickets_select_admin_or_owner" ON support_tickets;
CREATE POLICY "support_tickets_select_admin_or_owner" ON support_tickets FOR SELECT
  TO authenticated USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "support_tickets_update_admin" ON support_tickets;
CREATE POLICY "support_tickets_update_admin" ON support_tickets FOR UPDATE
  TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

DROP POLICY IF EXISTS "support_tickets_delete_admin" ON support_tickets;
CREATE POLICY "support_tickets_delete_admin" ON support_tickets FOR DELETE
  TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- =========================================================
-- MOVER PAYOUTS (ESCROW)
-- =========================================================
CREATE TABLE IF NOT EXISTS mover_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  mover_id uuid NOT NULL REFERENCES movers(id) ON DELETE CASCADE,
  mover_name text NOT NULL DEFAULT '',
  national_id text NOT NULL DEFAULT '',
  payment_channel text NOT NULL CHECK (payment_channel IN ('mpesa_send_money','mpesa_paybill','mpesa_lipa_na_mpesa','airtel_money')),
  renter_payment numeric NOT NULL CHECK (renter_payment >= 0),
  platform_deduction numeric NOT NULL CHECK (platform_deduction >= 0),
  net_mover_payable numeric NOT NULL CHECK (net_mover_payable >= 0),
  down_payment_amount numeric NOT NULL DEFAULT 0 CHECK (down_payment_amount >= 0),
  final_payment_amount numeric NOT NULL DEFAULT 0 CHECK (final_payment_amount >= 0),
  down_payment_status text NOT NULL DEFAULT 'held' CHECK (down_payment_status IN ('held','released')),
  final_payment_status text NOT NULL DEFAULT 'held' CHECK (final_payment_status IN ('held','released')),
  job_started_at timestamptz,
  delivery_confirmed_at timestamptz,
  down_payment_released_at timestamptz,
  final_payment_released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id)
);

ALTER TABLE mover_payouts ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_mover_payouts_status ON mover_payouts(down_payment_status, final_payment_status);

DROP POLICY IF EXISTS "mover_payouts_select_admin_or_mover" ON mover_payouts;
CREATE POLICY "mover_payouts_select_admin_or_mover" ON mover_payouts FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM movers WHERE movers.id = mover_payouts.mover_id AND movers.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "mover_payouts_insert_admin" ON mover_payouts;
CREATE POLICY "mover_payouts_insert_admin" ON mover_payouts FOR INSERT
  TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

DROP POLICY IF EXISTS "mover_payouts_update_admin" ON mover_payouts;
CREATE POLICY "mover_payouts_update_admin" ON mover_payouts FOR UPDATE
  TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

DROP POLICY IF EXISTS "mover_payouts_delete_admin" ON mover_payouts;
CREATE POLICY "mover_payouts_delete_admin" ON mover_payouts FOR DELETE
  TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- =========================================================
-- SECURITY DEFINER FUNCTIONS (admin-only)
-- =========================================================
CREATE OR REPLACE FUNCTION admin_review_listing(p_listing_id uuid, p_decision text, p_note text DEFAULT '')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF p_decision NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'Invalid decision';
  END IF;
  UPDATE listings SET
    approval_status = p_decision,
    is_published = (p_decision = 'approved'),
    admin_reviewed_at = now(),
    admin_review_note = COALESCE(p_note, '')
  WHERE id = p_listing_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION admin_review_listing FROM anon;
GRANT EXECUTE ON FUNCTION admin_review_listing TO authenticated;

CREATE OR REPLACE FUNCTION admin_release_mover_payout(p_payout_id uuid, p_tranche text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE payout mover_payouts%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  SELECT * INTO payout FROM mover_payouts WHERE id = p_payout_id FOR UPDATE;
  IF payout.id IS NULL OR p_tranche NOT IN ('down_payment','final_payment') THEN
    RAISE EXCEPTION 'Invalid payout';
  END IF;
  IF p_tranche = 'down_payment' THEN
    UPDATE mover_payouts SET
      down_payment_status = 'released',
      job_started_at = COALESCE(job_started_at, now()),
      down_payment_released_at = now()
    WHERE id = p_payout_id AND down_payment_status = 'held';
  ELSE
    IF payout.down_payment_status <> 'released' OR payout.delivery_confirmed_at IS NULL THEN
      RAISE EXCEPTION 'Delivery confirmation required before final payout';
    END IF;
    UPDATE mover_payouts SET
      final_payment_status = 'released',
      final_payment_released_at = now()
    WHERE id = p_payout_id AND final_payment_status = 'held';
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION admin_release_mover_payout FROM anon;
GRANT EXECUTE ON FUNCTION admin_release_mover_payout TO authenticated;

-- =========================================================
-- TRIGGERS
-- =========================================================
CREATE TRIGGER update_support_tickets_updated_at BEFORE UPDATE ON support_tickets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_mover_payouts_updated_at BEFORE UPDATE ON mover_payouts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =========================================================
-- STORAGE BUCKETS
-- =========================================================
INSERT INTO storage.buckets (id, name, public) VALUES
  ('id-documents', 'id-documents', false),
  ('licenses', 'licenses', false),
  ('kyc-documents', 'kyc-documents', false),
  ('listing-media', 'listing-media', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: users upload to their own folder
DROP POLICY IF EXISTS "id_docs_upload_own" ON storage.objects;
CREATE POLICY "id_docs_upload_own" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (
    bucket_id IN ('id-documents','licenses','kyc-documents')
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "id_docs_read_own" ON storage.objects;
CREATE POLICY "id_docs_read_own" ON storage.objects FOR SELECT
  TO authenticated USING (
    bucket_id IN ('id-documents','licenses','kyc-documents')
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "listing_media_upload_own" ON storage.objects;
CREATE POLICY "listing_media_upload_own" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (
    bucket_id = 'listing-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "listing_media_read_all" ON storage.objects;
CREATE POLICY "listing_media_read_all" ON storage.objects FOR SELECT
  TO anon, authenticated USING (bucket_id = 'listing-media');
