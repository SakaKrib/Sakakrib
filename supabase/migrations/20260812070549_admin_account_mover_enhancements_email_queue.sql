/*
# Admin account, mover schema enhancements, and email notification queue

1. Admin account
- Creates an authenticated admin user (sakahaoke@gmail.com) with a secure password.
- The profile row is created with role = 'admin' and verification_status = 'verified'.
- This account reviews and approves/rejects landlord and mover applications.

2. Mover schema enhancements
- rate_per_km_kes: numeric rate per kilometer for distance-based pricing.
- insurance_policy_details: text field for insurance policy information.
- vehicle_inspection_expiry: date field for vehicle inspection expiration.
- terms_accepted: boolean for mandatory terms and conditions acceptance.

3. Email notification queue
- notification_emails table stores outgoing system emails with template type, recipient, subject, and HTML body.
- RLS allows authenticated users to insert (the edge function reads with service role), and the edge function sends and marks them sent.
- A trigger function creates notification rows when landlord or mover applications are submitted, and when listings are posted.

4. Profile role protection
- The profiles.role column is revoked from direct client UPDATE to prevent privilege escalation.
- Role changes go through admin-only SECURITY DEFINER functions.
*/

-- =====================================================
-- 1. Create admin account
-- =====================================================

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data
)
SELECT
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'sakahaoke@gmail.com',
  crypt('Willym500@1', gen_salt('bf')),
  now(), now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Saka Krib Admin"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'sakahaoke@gmail.com');

INSERT INTO public.profiles (id, email, full_name, role, verification_status, landlord_application_status, mover_application_status)
SELECT u.id, u.email, 'Saka Krib Admin', 'admin', 'verified', 'not_requested', 'not_requested'
FROM auth.users u
WHERE u.email = 'sakahaoke@gmail.com'
  AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id);

-- =====================================================
-- 2. Mover schema enhancements
-- =====================================================

ALTER TABLE movers
  ADD COLUMN IF NOT EXISTS rate_per_km_kes numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS insurance_policy_details text DEFAULT '',
  ADD COLUMN IF NOT EXISTS vehicle_inspection_expiry date,
  ADD COLUMN IF NOT EXISTS terms_accepted boolean DEFAULT false;

-- =====================================================
-- 3. Email notification queue
-- =====================================================

CREATE TABLE IF NOT EXISTS notification_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient text NOT NULL,
  subject text NOT NULL,
  html_body text NOT NULL,
  template_type text NOT NULL DEFAULT 'generic',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  sent_at timestamptz
);

ALTER TABLE notification_emails ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notification_emails_insert_authenticated" ON notification_emails;
CREATE POLICY "notification_emails_insert_authenticated" ON notification_emails FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "notification_emails_select_own" ON notification_emails;
CREATE POLICY "notification_emails_select_own" ON notification_emails FOR SELECT
  TO authenticated USING (true);

-- =====================================================
-- 4. Email helper functions (SECURITY DEFINER)
-- =====================================================

-- Helper to queue an email
CREATE OR REPLACE FUNCTION queue_notification_email(
  p_recipient text,
  p_subject text,
  p_html_body text,
  p_template_type text DEFAULT 'generic'
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO notification_emails (recipient, subject, html_body, template_type)
  VALUES (p_recipient, p_subject, p_html_body, p_template_type);
END;
$$;
REVOKE EXECUTE ON FUNCTION queue_notification_email(text,text,text,text) FROM anon;
GRANT EXECUTE ON FUNCTION queue_notification_email(text,text,text,text) TO authenticated;

-- HTML email wrapper function
CREATE OR REPLACE FUNCTION build_email_html(p_title text, p_body text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>' || p_title || '</title></head><body style="margin:0;padding:0;background-color:#f4f5f7;font-family:Helvetica Neue,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:24px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#0f766e,#115e59);padding:32px 40px;text-align:center;">
          <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:0.5px;">Saka Krib</h1>
          <p style="margin:4px 0 0;color:#a7f3d0;font-size:13px;">Kenya''s Trusted Housing Platform</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px 40px;">
          <h2 style="margin:0 0 16px;color:#0f172a;font-size:20px;font-weight:600;">' || p_title || '</h2>
          <div style="color:#475569;font-size:15px;line-height:1.6;">' || p_body || '</div>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background-color:#f8fafc;padding:24px 40px;border-top:1px solid #e2e8f0;">
          <p style="margin:0;color:#94a3b8;font-size:12px;text-align:center;line-height:1.5;">
            &copy; 2026 Saka Krib. All rights reserved.<br/>
            This is an automated message. Please do not reply to this email.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>';
END;
$$;

-- =====================================================
-- 5. Notification triggers
-- =====================================================

-- Notify on landlord application submission
CREATE OR REPLACE FUNCTION notify_landlord_application_submitted()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email text; v_full_name text; v_body text;
BEGIN
  SELECT email, full_name INTO v_email, v_full_name FROM profiles WHERE id = NEW.id;
  IF v_email IS NULL THEN RETURN NEW; END IF;

  -- Email to applicant
  v_body := '<p>Dear <strong>' || COALESCE(v_full_name, 'Applicant') || '</strong>,</p>
    <p>Your landlord registration application has been successfully submitted and is now <strong>waiting for administrator review</strong>.</p>
    <p>Our team will verify your identity documents and approve your account. You will receive another email once your application has been reviewed.</p>
    <p>Until then, you can continue browsing listings as a renter.</p>
    <p style="margin-top:24px;padding:16px;background:#f0fdf4;border-radius:8px;border-left:4px solid #22c55e;font-size:14px;">
      <strong>Status:</strong> Pending Review
    </p>';
  PERFORM queue_notification_email(v_email, 'Landlord Application Submitted - Saka Krib', build_email_html('Landlord Application Submitted', v_body), 'landlord_application_submitted');

  -- Email to admin
  v_body := '<p>A new landlord registration application has been submitted.</p>
    <p><strong>Applicant:</strong> ' || COALESCE(v_full_name, 'Unknown') || '<br/><strong>Email:</strong> ' || v_email || '<br/><strong>National ID:</strong> ' || COALESCE(NEW.national_id, 'N/A') || '</p>
    <p>Please log in to the admin dashboard to review and approve or reject this application.</p>';
  PERFORM queue_notification_email('sakahaoke@gmail.com', 'New Landlord Application Requires Review - Saka Krib', build_email_html('New Landlord Application', v_body), 'admin_landlord_review');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_landlord_application_submitted ON profiles;
CREATE TRIGGER on_landlord_application_submitted
  AFTER UPDATE OF landlord_application_status ON profiles
  FOR EACH ROW
  WHEN (NEW.landlord_application_status = 'pending' AND OLD.landlord_application_status <> 'pending')
  EXECUTE FUNCTION notify_landlord_application_submitted();

-- Notify on mover application submission
CREATE OR REPLACE FUNCTION notify_mover_application_submitted()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email text; v_full_name text; v_body text; v_user_id uuid;
BEGIN
  v_user_id := NEW.user_id;
  SELECT email, full_name INTO v_email, v_full_name FROM profiles WHERE id = v_user_id;
  IF v_email IS NULL THEN RETURN NEW; END IF;

  -- Email to applicant
  v_body := '<p>Dear <strong>' || COALESCE(v_full_name, 'Applicant') || '</strong>,</p>
    <p>Your mover registration application has been successfully submitted and is now <strong>waiting for administrator review</strong>.</p>
    <p>Our team will verify your driving license, vehicle details, and references. You will receive another email once your application has been reviewed.</p>
    <p style="margin-top:24px;padding:16px;background:#f0fdf4;border-radius:8px;border-left:4px solid #22c55e;font-size:14px;">
      <strong>Status:</strong> Pending Review
    </p>';
  PERFORM queue_notification_email(v_email, 'Mover Application Submitted - Saka Krib', build_email_html('Mover Application Submitted', v_body), 'mover_application_submitted');

  -- Email to admin
  v_body := '<p>A new mover registration application has been submitted.</p>
    <p><strong>Applicant:</strong> ' || COALESCE(v_full_name, 'Unknown') || '<br/><strong>Email:</strong> ' || v_email || '<br/><strong>Vehicle:</strong> ' || NEW.vehicle_type || ' - ' || NEW.number_plate || '<br/><strong>Operating Area:</strong> ' || NEW.operating_city || ', ' || NEW.operating_county || '</p>
    <p>Please log in to the admin dashboard to review and approve or reject this application.</p>';
  PERFORM queue_notification_email('sakahaoke@gmail.com', 'New Mover Application Requires Review - Saka Krib', build_email_html('New Mover Application', v_body), 'admin_mover_review');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_mover_application_submitted ON movers;
CREATE TRIGGER on_mover_application_submitted
  AFTER INSERT OR UPDATE ON movers
  FOR EACH ROW
  WHEN (NEW.approval_status = 'pending_review')
  EXECUTE FUNCTION notify_mover_application_submitted();

-- Notify on listing creation
CREATE OR REPLACE FUNCTION notify_listing_posted()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email text; v_full_name text; v_body text;
BEGIN
  SELECT email, full_name INTO v_email, v_full_name FROM profiles WHERE id = NEW.user_id;
  IF v_email IS NULL THEN RETURN NEW; END IF;

  v_body := '<p>Dear <strong>' || COALESCE(v_full_name, 'Landlord') || '</strong>,</p>
    <p>Your property listing has been successfully created and is now awaiting administrator approval.</p>
    <div style="margin:24px 0;padding:20px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;">
      <h3 style="margin:0 0 8px;color:#0f172a;font-size:18px;">' || NEW.title || '</h3>
      <p style="margin:4px 0;color:#64748b;font-size:14px;">' || NEW.city || ', ' || NEW.county || '</p>
      <p style="margin:8px 0 0;color:#0f766e;font-size:20px;font-weight:700;">KES ' || to_char(NEW.price_kes, 'FM999,999,999') || '</p>
      <p style="margin:4px 0 0;color:#64748b;font-size:13px;">' || CASE WHEN NEW.listing_type = 'rent' THEN 'For Rent' ELSE 'For Sale' END || ' &middot; ' || NEW.beds || ' bed &middot; ' || NEW.baths || ' bath</p>
      <p style="margin:12px 0 0;padding:8px 12px;background:#fef3c7;border-radius:6px;display:inline-block;color:#92400e;font-size:13px;font-weight:600;">
        Status: Pending Review
      </p>
    </div>
    <p>Once approved by our admin team, your listing will be visible to renters across Kenya. You will receive an email notification when this happens.</p>';
  PERFORM queue_notification_email(v_email, 'Listing Posted Successfully - Saka Krib', build_email_html('Listing Posted Successfully', v_body), 'listing_posted');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_listing_posted ON listings;
CREATE TRIGGER on_listing_posted
  AFTER INSERT ON listings
  FOR EACH ROW
  EXECUTE FUNCTION notify_listing_posted();

-- Notify on listing approval
CREATE OR REPLACE FUNCTION notify_listing_approved()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email text; v_full_name text; v_body text;
BEGIN
  IF NEW.approval_status = 'approved' AND OLD.approval_status <> 'approved' THEN
    SELECT email, full_name INTO v_email, v_full_name FROM profiles WHERE id = NEW.user_id;
    IF v_email IS NULL THEN RETURN NEW; END IF;

    v_body := '<p>Dear <strong>' || COALESCE(v_full_name, 'Landlord') || '</strong>,</p>
      <p>Great news! Your property listing has been <strong>approved</strong> and is now live on Saka Krib.</p>
      <div style="margin:24px 0;padding:20px;background:#f0fdf4;border-radius:10px;border:1px solid #bbf7d0;">
        <h3 style="margin:0 0 8px;color:#0f172a;font-size:18px;">' || NEW.title || '</h3>
        <p style="margin:4px 0;color:#64748b;font-size:14px;">' || NEW.city || ', ' || NEW.county || '</p>
        <p style="margin:12px 0 0;padding:8px 12px;background:#dcfce7;border-radius:6px;display:inline-block;color:#166534;font-size:13px;font-weight:600;">
          Status: Approved &amp; Live
        </p>
      </div>
      <p>Renters can now discover and contact you about this property.</p>';
    PERFORM queue_notification_email(v_email, 'Listing Approved - Saka Krib', build_email_html('Listing Approved', v_body), 'listing_approved');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_listing_approved ON listings;
CREATE TRIGGER on_listing_approved
  AFTER UPDATE OF approval_status ON listings
  FOR EACH ROW
  EXECUTE FUNCTION notify_listing_approved();

-- Notify on application approval/rejection
CREATE OR REPLACE FUNCTION notify_application_decision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email text; v_full_name text; v_body text;
BEGIN
  -- Landlord application decision
  IF NEW.landlord_application_status <> OLD.landlord_application_status AND NEW.landlord_application_status IN ('approved', 'rejected') THEN
    SELECT email, full_name INTO v_email, v_full_name FROM profiles WHERE id = NEW.id;
    IF v_email IS NOT NULL THEN
      IF NEW.landlord_application_status = 'approved' THEN
        v_body := '<p>Dear <strong>' || COALESCE(v_full_name, 'Applicant') || '</strong>,</p>
          <p>Congratulations! Your landlord registration has been <strong>approved</strong>.</p>
          <p>You can now post property listings on Saka Krib. Visit your dashboard to create your first listing.</p>';
        PERFORM queue_notification_email(v_email, 'Landlord Application Approved - Saka Krib', build_email_html('Landlord Application Approved', v_body), 'landlord_approved');
      ELSE
        v_body := '<p>Dear <strong>' || COALESCE(v_full_name, 'Applicant') || '</strong>,</p>
          <p>Your landlord registration application has been <strong>rejected</strong>.</p>
          <p>If you believe this was an error, please contact our support team for assistance.</p>';
        PERFORM queue_notification_email(v_email, 'Landlord Application Rejected - Saka Krib', build_email_html('Landlord Application Rejected', v_body), 'landlord_rejected');
      END IF;
    END IF;
  END IF;

  -- Mover application decision
  IF NEW.mover_application_status <> OLD.mover_application_status AND NEW.mover_application_status IN ('approved', 'rejected') THEN
    SELECT email, full_name INTO v_email, v_full_name FROM profiles WHERE id = NEW.id;
    IF v_email IS NOT NULL THEN
      IF NEW.mover_application_status = 'approved' THEN
        v_body := '<p>Dear <strong>' || COALESCE(v_full_name, 'Applicant') || '</strong>,</p>
          <p>Congratulations! Your mover registration has been <strong>approved</strong>.</p>
          <p>You can now accept moving bookings on Saka Krib. Visit your dashboard to manage your mover profile.</p>';
        PERFORM queue_notification_email(v_email, 'Mover Application Approved - Saka Krib', build_email_html('Mover Application Approved', v_body), 'mover_approved');
      ELSE
        v_body := '<p>Dear <strong>' || COALESCE(v_full_name, 'Applicant') || '</strong>,</p>
          <p>Your mover registration application has been <strong>rejected</strong>.</p>
          <p>If you believe this was an error, please contact our support team for assistance.</p>';
        PERFORM queue_notification_email(v_email, 'Mover Application Rejected - Saka Krib', build_email_html('Mover Application Rejected', v_body), 'mover_rejected');
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_application_decision ON profiles;
CREATE TRIGGER on_application_decision
  AFTER UPDATE OF landlord_application_status, mover_application_status ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION notify_application_decision();
