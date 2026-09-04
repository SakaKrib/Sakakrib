/**
 * Frontend domain contracts for the Django API.
 *
 * These are intentionally transport-neutral. They describe the JSON shapes
 * consumed by existing screens without importing or naming a Supabase client.
 */

export type UserRole = 'renter' | 'landlord' | 'mover' | 'real_estate' | 'admin' | string;
export type VerificationStatus = 'unverified' | 'pending_verification' | 'verified' | 'rejected' | string;

export interface Profile extends Record<string, any> {
  id: string;
  email?: string | null;
  full_name?: string | null;
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  is_admin?: boolean;
  is_staff?: boolean;
  is_superuser?: boolean;
  role?: UserRole;
  kyc_completed?: boolean;
  verification_status?: VerificationStatus;
  landlord_application_status?: string | null;
  real_estate_application_status?: string | null;
  mover_application_status?: string | null;
  national_id?: string | null;
  dl_number?: string | null;
  phone?: string | null;
  profile_photo_url?: string | null;
  id_photo_url?: string | null;
  selfie_url?: string | null;
  id_document_url?: string | null;
  id_document_type?: string | null;
  city?: string | null;
  county?: string | null;
  is_agency?: boolean;
  free_listings_used?: number;
  email_verified?: boolean;
  admin_review_note?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Listing extends Record<string, any> {
  id: string;
  user_id?: string;
  title?: string;
  description?: string;
  city?: string;
  county?: string;
  price_kes?: number | null;
  listing_type?: string | null;
  deposit_required?: boolean | null;
  deposit_structure?: string | null;
  deposit_amount?: number | null;
  size?: string | null;
  beds?: number | null;
  baths?: number | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  social_links?: Record<string, unknown> | null;
  is_property_management?: boolean;
  property_name?: string | null;
  property_type?: string | null;
  location_search?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  booking_enabled?: boolean;
  payment_enabled?: boolean;
  ai_caption?: string | null;
  ai_caption_generated_at?: string | null;
  is_published?: boolean;
  is_approved?: boolean;
  is_paid?: boolean;
  approval_status?: string | null;
  status?: string | null;
  created_at?: string;
  updated_at?: string;
  media?: ListingMedia[];
  landlord?: Profile | null;
}

export interface ListingMedia extends Record<string, any> {
  id?: string;
  listing_id?: string;
  user_id?: string;
  unit_id?: string | null;
  url: string;
  label?: string | null;
  media_type?: string;
  position?: number;
  created_at?: string;
}

export interface Mover extends Record<string, any> {
  id: string;
  user_id?: string;
  driver_full_name?: string;
  vehicle_type?: string;
  number_plate?: string;
  operating_city?: string;
  operating_county?: string;
  phone?: string | null;
  profile_photo_url?: string | null;
  base_rate_kes?: number;
  is_available?: boolean;
  approval_status?: string;
  rate_per_km_kes?: number;
  created_at?: string;
  updated_at?: string;
}

export interface Booking extends Record<string, any> {
  id: string;
  renter_id?: string;
  mover_id?: string;
  listing_id?: string | null;
  pickup_address?: string;
  dropoff_address?: string;
  moving_date?: string;
  booking_amount?: number;
  commission_amount?: number;
  total_amount?: number;
  status?: string;
  payment_status?: string;
  payment_method?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Review extends Record<string, any> {
  id: string;
  rating: number;
  reviewer_id?: string;
  mover_id?: string;
  listing_id?: string;
  comment?: string | null;
  created_at?: string;
}

export interface Subscription extends Record<string, any> {
  id: string;
  landlord_id?: string;
  real_estate_id?: string;
  plan_id?: string;
  billing_cycle?: string;
  status?: string;
  current_period_start?: string;
  current_period_end?: string;
  grace_period_end?: string | null;
  auto_renew?: boolean;
  paypal_subscription_id?: string | null;
  paypal_plan_id?: string | null;
  paypal_status?: string | null;
  next_billing_at?: string | null;
  cancel_at_period_end?: boolean;
  cancelled_at?: string | null;
  billing_amount_kes?: number | null;
  billing_amount_usd?: number | null;
  billing_exchange_rate?: number | null;
  billing_exchange_rate_timestamp?: string | null;
  plan?: SubscriptionPlan | null;
  created_at?: string;
  updated_at?: string;
}

export interface SubscriptionPlan extends Record<string, any> {
  id: string;
  name: string;
  audience?: string;
  max_listings?: number | null;
  max_units_per_listing?: number | null;
  monthly_price_kes?: number;
  annual_price_kes?: number;
}

export interface CommunityPost extends Record<string, any> {
  id: string;
  user_id?: string;
  author_id?: string;
  content?: string;
  title?: string | null;
  created_at?: string;
  updated_at?: string;
  profile?: Profile | null;
  listing?: Listing | null;
  media?: ListingMedia[];
}
