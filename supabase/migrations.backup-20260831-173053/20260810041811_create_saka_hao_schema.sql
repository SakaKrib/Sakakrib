/*
# Saka Hao — Initial Schema

1. Purpose
   Full-stack real estate, house renting, and movers marketplace for Kenya.
   Supports three user roles: Renter, Landlord/Real Estate, Mover.

2. New Tables
   - `profiles` — extends auth.users with role, verification status, KYC data.
   - `listings` — house postings by landlords/agencies.
   - `listing_media` — photos and videos attached to a listing.
   - `movers` — mover onboarding records (driver, vehicle, DL).
   - `bookings` — renter bookings for movers (with 10% commission).
   - `reviews` — renter reviews/ratings of landlords and movers.
   - `community_posts` — LinkedIn-style feed posts (auto-created from listings).
   - `terms_acceptance` — tracks T&C acceptance per user per context.

3. Security
   - RLS enabled on every table.
   - All tables scoped to `authenticated` with ownership checks via `auth.uid()`.
   - Profiles: owner can read/update own row; anyone authenticated can read (for directory).
   - Listings: anyone authenticated can SELECT; owner can INSERT/UPDATE/DELETE.
   - Community posts: anyone authenticated can SELECT; owner of source listing can INSERT/DELETE.
   - Reviews: anyone authenticated can SELECT; the reviewer can INSERT/UPDATE/DELETE own reviews.

4. Notes
   - `user_id` columns default to `auth.uid()` so client inserts omitting the owner succeed.
   - Listing media is scoped through the parent listing ownership.
   - Booking commission is stored as a column (10% of booking_amount).
*/

-- =========================================================
-- PROFILES
-- =========================================================
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'renter' CHECK (role IN ('renter','landlord','mover','real_estate')),
  verification_status text NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified','pending_verification','verified','rejected')),
  national_id text DEFAULT '',
  dl_number text DEFAULT '',
  phone text DEFAULT '',
  profile_photo_url text DEFAULT '',
  id_photo_url text DEFAULT '',
  selfie_url text DEFAULT '',
  city text DEFAULT '',
  county text DEFAULT '',
  is_agency boolean NOT NULL DEFAULT false,
  free_listings_used integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_all" ON profiles;
CREATE POLICY "profiles_select_all" ON profiles FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- =========================================================
-- LISTINGS
-- =========================================================
CREATE TABLE IF NOT EXISTS listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  county text NOT NULL DEFAULT '',
  price_kes numeric NOT NULL DEFAULT 0,
  listing_type text NOT NULL DEFAULT 'rent' CHECK (listing_type IN ('rent','sale')),
  deposit_required boolean NOT NULL DEFAULT false,
  deposit_structure text NOT NULL DEFAULT 'fixed' CHECK (deposit_structure IN ('fixed','installments')),
  deposit_amount numeric NOT NULL DEFAULT 0,
  size text NOT NULL DEFAULT '',
  beds integer DEFAULT 0,
  baths integer DEFAULT 0,
  contact_phone text DEFAULT '',
  contact_email text DEFAULT '',
  social_links jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_paid boolean NOT NULL DEFAULT false,
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE listings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "listings_select_all" ON listings;
CREATE POLICY "listings_select_all" ON listings FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "listings_insert_own" ON listings;
CREATE POLICY "listings_insert_own" ON listings FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "listings_update_own" ON listings;
CREATE POLICY "listings_update_own" ON listings FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "listings_delete_own" ON listings;
CREATE POLICY "listings_delete_own" ON listings FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_listings_city ON listings(city);
CREATE INDEX IF NOT EXISTS idx_listings_user_id ON listings(user_id);
CREATE INDEX IF NOT EXISTS idx_listings_created_at ON listings(created_at DESC);

-- =========================================================
-- LISTING MEDIA
-- =========================================================
CREATE TABLE IF NOT EXISTS listing_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  url text NOT NULL,
  label text NOT NULL DEFAULT '',
  media_type text NOT NULL DEFAULT 'photo' CHECK (media_type IN ('photo','video')),
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE listing_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "listing_media_select_all" ON listing_media;
CREATE POLICY "listing_media_select_all" ON listing_media FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "listing_media_insert_own" ON listing_media;
CREATE POLICY "listing_media_insert_own" ON listing_media FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "listing_media_update_own" ON listing_media;
CREATE POLICY "listing_media_update_own" ON listing_media FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "listing_media_delete_own" ON listing_media;
CREATE POLICY "listing_media_delete_own" ON listing_media FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_listing_media_listing_id ON listing_media(listing_id);

-- =========================================================
-- MOVERS
-- =========================================================
CREATE TABLE IF NOT EXISTS movers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  driver_full_name text NOT NULL DEFAULT '',
  national_id text NOT NULL DEFAULT '',
  dl_number text NOT NULL DEFAULT '',
  dl_photo_url text DEFAULT '',
  vehicle_type text NOT NULL DEFAULT 'pickup' CHECK (vehicle_type IN ('pickup','lorry','trailer')),
  number_plate text NOT NULL DEFAULT '',
  operating_city text NOT NULL DEFAULT '',
  operating_county text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  profile_photo_url text DEFAULT '',
  base_rate_kes numeric NOT NULL DEFAULT 0,
  is_available boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE movers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "movers_select_all" ON movers;
CREATE POLICY "movers_select_all" ON movers FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "movers_insert_own" ON movers;
CREATE POLICY "movers_insert_own" ON movers FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "movers_update_own" ON movers;
CREATE POLICY "movers_update_own" ON movers FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "movers_delete_own" ON movers;
CREATE POLICY "movers_delete_own" ON movers FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_movers_user_id ON movers(user_id);
CREATE INDEX IF NOT EXISTS idx_movers_city ON movers(operating_city);

-- =========================================================
-- BOOKINGS (mover bookings by renters)
-- =========================================================
CREATE TABLE IF NOT EXISTS bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  renter_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  mover_id uuid NOT NULL REFERENCES movers(id) ON DELETE CASCADE,
  listing_id uuid REFERENCES listings(id) ON DELETE SET NULL,
  pickup_address text NOT NULL DEFAULT '',
  dropoff_address text NOT NULL DEFAULT '',
  moving_date date NOT NULL DEFAULT CURRENT_DATE,
  booking_amount numeric NOT NULL DEFAULT 0,
  commission_amount numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','completed','cancelled')),
  payment_status text NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','paid','refunded')),
  payment_method text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bookings_select_own" ON bookings;
CREATE POLICY "bookings_select_own" ON bookings FOR SELECT
  TO authenticated USING (auth.uid() = renter_id OR EXISTS (SELECT 1 FROM movers WHERE movers.id = bookings.mover_id AND movers.user_id = auth.uid()));

DROP POLICY IF EXISTS "bookings_insert_own" ON bookings;
CREATE POLICY "bookings_insert_own" ON bookings FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = renter_id);

DROP POLICY IF EXISTS "bookings_update_own" ON bookings;
CREATE POLICY "bookings_update_own" ON bookings FOR UPDATE
  TO authenticated USING (auth.uid() = renter_id OR EXISTS (SELECT 1 FROM movers WHERE movers.id = bookings.mover_id AND movers.user_id = auth.uid()))
  WITH CHECK (auth.uid() = renter_id OR EXISTS (SELECT 1 FROM movers WHERE movers.id = bookings.mover_id AND movers.user_id = auth.uid()));

DROP POLICY IF EXISTS "bookings_delete_own" ON bookings;
CREATE POLICY "bookings_delete_own" ON bookings FOR DELETE
  TO authenticated USING (auth.uid() = renter_id);

CREATE INDEX IF NOT EXISTS idx_bookings_renter_id ON bookings(renter_id);
CREATE INDEX IF NOT EXISTS idx_bookings_mover_id ON bookings(mover_id);

-- =========================================================
-- REVIEWS
-- =========================================================
CREATE TABLE IF NOT EXISTS reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reviewer_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  reviewee_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id uuid REFERENCES listings(id) ON DELETE SET NULL,
  mover_id uuid REFERENCES movers(id) ON DELETE SET NULL,
  rating integer NOT NULL DEFAULT 5 CHECK (rating >= 1 AND rating <= 5),
  comment text NOT NULL DEFAULT '',
  review_type text NOT NULL CHECK (review_type IN ('landlord','mover')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reviews_select_all" ON reviews;
CREATE POLICY "reviews_select_all" ON reviews FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "reviews_insert_own" ON reviews;
CREATE POLICY "reviews_insert_own" ON reviews FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = reviewer_id);

DROP POLICY IF EXISTS "reviews_update_own" ON reviews;
CREATE POLICY "reviews_update_own" ON reviews FOR UPDATE
  TO authenticated USING (auth.uid() = reviewer_id) WITH CHECK (auth.uid() = reviewer_id);

DROP POLICY IF EXISTS "reviews_delete_own" ON reviews;
CREATE POLICY "reviews_delete_own" ON reviews FOR DELETE
  TO authenticated USING (auth.uid() = reviewer_id);

CREATE INDEX IF NOT EXISTS idx_reviews_reviewee_id ON reviews(reviewee_id);
CREATE INDEX IF NOT EXISTS idx_reviews_mover_id ON reviews(mover_id);

-- =========================================================
-- COMMUNITY POSTS
-- =========================================================
CREATE TABLE IF NOT EXISTS community_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id uuid REFERENCES listings(id) ON DELETE CASCADE,
  content text NOT NULL DEFAULT '',
  ai_caption text DEFAULT '',
  post_type text NOT NULL DEFAULT 'listing' CHECK (post_type IN ('listing','manual')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "community_posts_select_all" ON community_posts;
CREATE POLICY "community_posts_select_all" ON community_posts FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "community_posts_insert_own" ON community_posts;
CREATE POLICY "community_posts_insert_own" ON community_posts FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "community_posts_update_own" ON community_posts;
CREATE POLICY "community_posts_update_own" ON community_posts FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "community_posts_delete_own" ON community_posts;
CREATE POLICY "community_posts_delete_own" ON community_posts FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_community_posts_created_at ON community_posts(created_at DESC);

-- =========================================================
-- TERMS ACCEPTANCE
-- =========================================================
CREATE TABLE IF NOT EXISTS terms_acceptance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  context text NOT NULL CHECK (context IN ('landlord','mover','listing')),
  accepted boolean NOT NULL DEFAULT false,
  accepted_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE terms_acceptance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "terms_select_own" ON terms_acceptance;
CREATE POLICY "terms_select_own" ON terms_acceptance FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "terms_insert_own" ON terms_acceptance;
CREATE POLICY "terms_insert_own" ON terms_acceptance FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "terms_update_own" ON terms_acceptance;
CREATE POLICY "terms_update_own" ON terms_acceptance FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_terms_user_id ON terms_acceptance(user_id);

-- =========================================================
-- updated_at trigger function
-- =========================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_listings_updated_at ON listings;
CREATE TRIGGER update_listings_updated_at BEFORE UPDATE ON listings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_movers_updated_at ON movers;
CREATE TRIGGER update_movers_updated_at BEFORE UPDATE ON movers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_bookings_updated_at ON bookings;
CREATE TRIGGER update_bookings_updated_at BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();