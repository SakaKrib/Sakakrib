/*
# Restore administrator approval workflows

1. Listing moderation
- New listings default to `pending_review` and cannot be published by the submitting user.
- Existing listings are returned to the pending queue so no previously auto-approved listing remains public.
- Renters, landlords, and other users cannot read listing rows or media until an administrator approves them.

2. Role applications
- `profiles.landlord_application_status` tracks landlord requests as `not_requested`, `pending`, `approved`, or `rejected`.
- `profiles.mover_application_status` tracks mover requests with the same states.
- Applicants remain renters while a request is pending. Only an administrator can change the role to landlord or mover.
- Existing verified mover accounts are marked approved to preserve already-reviewed accounts.

3. Mover moderation
- `movers.approval_status` tracks mover review state.
- Only approved and available movers are visible in the public mover directory.
- Pending mover records remain available to their owner and administrators only.

4. Server-enforced mutations
- Public client writes cannot change role, verification, or application-status fields.
- Landlord and mover submissions use authenticated database functions that verify the caller is currently a renter and reject duplicate pending or approved submissions.
- Administrator-only functions approve or reject landlord and mover applications.

5. Feed protection
- Listing community posts are readable only when their linked listing is approved.
- Manual community posts remain readable to authenticated users.
*/

-- Application and moderation status fields.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS landlord_application_status text NOT NULL DEFAULT 'not_requested',
  ADD COLUMN IF NOT EXISTS mover_application_status text NOT NULL DEFAULT 'not_requested';

ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_landlord_application_status_check;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_landlord_application_status_check
  CHECK (landlord_application_status IN ('not_requested', 'pending', 'approved', 'rejected'));

ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_mover_application_status_check;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_mover_application_status_check
  CHECK (mover_application_status IN ('not_requested', 'pending', 'approved', 'rejected'));

ALTER TABLE movers
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending_review';

ALTER TABLE movers
  DROP CONSTRAINT IF EXISTS movers_approval_status_check;
ALTER TABLE movers
  ADD CONSTRAINT movers_approval_status_check
  CHECK (approval_status IN ('pending_review', 'approved', 'rejected'));

-- Return all listings to the moderation queue after the previous auto-approval change.
ALTER TABLE listings ALTER COLUMN approval_status SET DEFAULT 'pending_review';
UPDATE listings
SET approval_status = 'pending_review', is_published = false
WHERE approval_status <> 'pending_review' OR is_published = true;

-- Preserve accounts that were already operating as verified movers.
UPDATE profiles
SET mover_application_status = 'approved'
WHERE role = 'mover' AND verification_status = 'verified';
UPDATE movers
SET approval_status = 'approved'
WHERE approval_status = 'pending_review'
  AND EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = movers.user_id
      AND profiles.role = 'mover'
      AND profiles.verification_status = 'verified'
  );

-- Public listing reads require approval. Owners do not bypass this rule.
DROP POLICY IF EXISTS "listings_select_approved_or_owned" ON listings;
DROP POLICY IF EXISTS "listings_select_approved" ON listings;
CREATE POLICY "listings_select_approved" ON listings FOR SELECT
  TO authenticated
  USING (
    approval_status = 'approved'
    AND is_published = true
  );

DROP POLICY IF EXISTS "listings_insert_own" ON listings;
DROP POLICY IF EXISTS "listings_insert_pending_landlord" ON listings;
CREATE POLICY "listings_insert_pending_landlord" ON listings FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND approval_status = 'pending_review'
    AND is_published = false
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('landlord', 'real_estate')
        AND profiles.landlord_application_status = 'approved'
        AND profiles.verification_status = 'verified'
    )
  );

DROP POLICY IF EXISTS "listings_update_own_or_admin" ON listings;
CREATE POLICY "listings_update_own_or_admin" ON listings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- Listing media follows listing visibility, including direct table reads.
DROP POLICY IF EXISTS "listing_media_select_all" ON listing_media;
DROP POLICY IF EXISTS "listing_media_select_approved" ON listing_media;
CREATE POLICY "listing_media_select_approved" ON listing_media FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM listings
      WHERE listings.id = listing_media.listing_id
        AND listings.approval_status = 'approved'
        AND listings.is_published = true
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- Listing community posts are hidden until their linked listing is approved.
DROP POLICY IF EXISTS "community_posts_select_all" ON community_posts;
DROP POLICY IF EXISTS "community_posts_select_visible" ON community_posts;
CREATE POLICY "community_posts_select_visible" ON community_posts FOR SELECT
  TO authenticated
  USING (
    listing_id IS NULL
    OR EXISTS (
      SELECT 1 FROM listings
      WHERE listings.id = community_posts.listing_id
        AND listings.approval_status = 'approved'
        AND listings.is_published = true
    )
  );

-- Only approved, available movers are visible to the directory. Owners/admins can see their own record internally.
DROP POLICY IF EXISTS "movers_select_all" ON movers;
DROP POLICY IF EXISTS "movers_select_approved" ON movers;
CREATE POLICY "movers_select_approved" ON movers FOR SELECT
  TO authenticated
  USING (
    (approval_status = 'approved' AND is_available = true)
    OR auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- Remove direct client control over privileged profile fields and mover records.
REVOKE UPDATE (role, verification_status, landlord_application_status, mover_application_status) ON profiles FROM authenticated;
REVOKE INSERT, UPDATE ON movers FROM authenticated;

-- Landlord application submission: the caller must still be a renter and cannot duplicate a pending/approved request.
CREATE OR REPLACE FUNCTION submit_landlord_application(
  p_first_name text,
  p_middle_name text,
  p_last_name text,
  p_email text,
  p_phone text,
  p_national_id text,
  p_document_type text,
  p_document_url text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_profile profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_profile FROM profiles WHERE id = auth.uid() FOR UPDATE;
  IF v_profile.id IS NULL OR v_profile.role <> 'renter' THEN
    RAISE EXCEPTION 'Only renter accounts can submit a landlord application';
  END IF;
  IF v_profile.landlord_application_status IN ('pending', 'approved') THEN
    RAISE EXCEPTION 'A landlord application is already pending or approved';
  END IF;
  IF p_document_type NOT IN ('national_id', 'passport') OR COALESCE(trim(p_document_url), '') = '' THEN
    RAISE EXCEPTION 'Identity document is required';
  END IF;
  UPDATE profiles SET
    first_name = trim(p_first_name), middle_name = trim(COALESCE(p_middle_name, '')), last_name = trim(p_last_name),
    full_name = trim(concat_ws(' ', p_first_name, p_middle_name, p_last_name)), email = trim(p_email), phone = trim(p_phone),
    national_id = trim(p_national_id), id_document_type = p_document_type, id_document_url = p_document_url,
    landlord_application_status = 'pending'
  WHERE id = auth.uid();
END;
$$;
REVOKE EXECUTE ON FUNCTION submit_landlord_application(text,text,text,text,text,text,text,text) FROM anon;
GRANT EXECUTE ON FUNCTION submit_landlord_application(text,text,text,text,text,text,text,text) TO authenticated;

-- Mover application submission: the caller must still be a renter and the row is always pending.
CREATE OR REPLACE FUNCTION submit_mover_application(p_application jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_profile profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_profile FROM profiles WHERE id = auth.uid() FOR UPDATE;
  IF v_profile.id IS NULL OR v_profile.role <> 'renter' THEN
    RAISE EXCEPTION 'Only renter accounts can submit a mover application';
  END IF;
  IF v_profile.mover_application_status IN ('pending', 'approved') THEN
    RAISE EXCEPTION 'A mover application is already pending or approved';
  END IF;
  IF COALESCE(p_application->>'dl_photo_url', '') = '' OR COALESCE(p_application->>'number_plate', '') = '' THEN
    RAISE EXCEPTION 'Mover evidence is required';
  END IF;
  INSERT INTO movers (
    user_id, driver_full_name, national_id, dl_number, dl_photo_url, vehicle_type, number_plate,
    operating_city, operating_county, phone, base_rate_kes, capacity_details, payment_channel,
    payment_account, liability_accepted, reference_contacts, is_available, approval_status
  ) VALUES (
    auth.uid(), p_application->>'driver_full_name', p_application->>'national_id', p_application->>'dl_number', p_application->>'dl_photo_url',
    p_application->>'vehicle_type', upper(p_application->>'number_plate'), p_application->>'operating_city', p_application->>'operating_county',
    p_application->>'phone', COALESCE((p_application->>'base_rate_kes')::numeric, 0), p_application->>'capacity_details',
    p_application->>'payment_channel', p_application->>'payment_account', COALESCE((p_application->>'liability_accepted')::boolean, false),
    COALESCE(p_application->'reference_contacts', '[]'::jsonb), false, 'pending_review'
  )
  ON CONFLICT (user_id) DO UPDATE SET
    driver_full_name = EXCLUDED.driver_full_name, national_id = EXCLUDED.national_id, dl_number = EXCLUDED.dl_number,
    dl_photo_url = EXCLUDED.dl_photo_url, vehicle_type = EXCLUDED.vehicle_type, number_plate = EXCLUDED.number_plate,
    operating_city = EXCLUDED.operating_city, operating_county = EXCLUDED.operating_county, phone = EXCLUDED.phone,
    base_rate_kes = EXCLUDED.base_rate_kes, capacity_details = EXCLUDED.capacity_details, payment_channel = EXCLUDED.payment_channel,
    payment_account = EXCLUDED.payment_account, liability_accepted = EXCLUDED.liability_accepted, reference_contacts = EXCLUDED.reference_contacts,
    is_available = false, approval_status = 'pending_review';
  UPDATE profiles SET mover_application_status = 'pending' WHERE id = auth.uid();
END;
$$;
REVOKE EXECUTE ON FUNCTION submit_mover_application(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION submit_mover_application(jsonb) TO authenticated;

-- Administrator-only application decisions.
CREATE OR REPLACE FUNCTION admin_review_landlord_application(p_user_id uuid, p_decision text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_decision NOT IN ('approved', 'rejected') THEN RAISE EXCEPTION 'Invalid decision'; END IF;
  UPDATE profiles SET landlord_application_status = p_decision, role = CASE WHEN p_decision = 'approved' THEN 'landlord' ELSE role END
  WHERE id = p_user_id AND role = 'renter' AND landlord_application_status = 'pending';
END;
$$;
REVOKE EXECUTE ON FUNCTION admin_review_landlord_application(uuid,text) FROM anon;
GRANT EXECUTE ON FUNCTION admin_review_landlord_application(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION admin_review_mover_application(p_user_id uuid, p_decision text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_decision NOT IN ('approved', 'rejected') THEN RAISE EXCEPTION 'Invalid decision'; END IF;
  UPDATE profiles SET mover_application_status = p_decision, role = CASE WHEN p_decision = 'approved' THEN 'mover' ELSE role END
  WHERE id = p_user_id AND role = 'renter' AND mover_application_status = 'pending';
  UPDATE movers SET approval_status = p_decision, is_available = (p_decision = 'approved')
  WHERE user_id = p_user_id AND approval_status = 'pending_review';
END;
$$;
REVOKE EXECUTE ON FUNCTION admin_review_mover_application(uuid,text) FROM anon;
GRANT EXECUTE ON FUNCTION admin_review_mover_application(uuid,text) TO authenticated;
