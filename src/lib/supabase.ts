import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export type UserRole = 'renter' | 'landlord' | 'mover' | 'real_estate' | 'admin';
export type VerificationStatus = 'unverified' | 'pending_verification' | 'verified' | 'rejected';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  is_admin: boolean;
  first_name: string;
  last_name: string;
  middle_name: string;
  role: UserRole;
  kyc_completed: boolean;
  verification_status: VerificationStatus;
  landlord_application_status: 'not_requested' | 'pending' | 'approved' | 'rejected';
  mover_application_status: 'not_requested' | 'pending' | 'approved' | 'rejected';
  national_id: string;
  dl_number: string;
  phone: string;
  profile_photo_url: string;
  id_photo_url: string;
  selfie_url: string;
  id_document_url: string;
  id_document_type: '' | 'national_id' | 'passport';
  city: string;
  county: string;
  is_agency: boolean;
  free_listings_used: number;
  created_at: string;
  updated_at: string;
}

export interface Listing {
    id: string;
    user_id: string;

    title: string;
    description: string;

    city: string;
    county: string;

    price_kes: number | null;

    listing_type: 'rent' | 'sale';

    deposit_required: boolean | null;
    deposit_structure: 'fixed' | 'installments' | null;
    deposit_amount: number | null;

    size: string | null;
    beds: number | null;
    baths: number | null;

    contact_phone: string;
    contact_email: string;

    status: 'pending' | 'approved' | 'rejected';

    social_links: {
      platform: string;
      url: string;
    }[];

    // Property management
    is_property_management: boolean;
    property_name: string | null;
    property_type: string | null;

    // Location
    location_search: string | null;
    latitude: number | null;
    longitude: number | null;

    // Tenant actions
    booking_enabled: boolean;
    payment_enabled: boolean;

    ai_caption: string;
    ai_caption_generated_at: string | null;

    created_at: string;
    updated_at: string;
  }

export interface ListingMedia {
  id: string;
  listing_id: string;
  url: string;
  label: string;
  media_type: 'photo' | 'video';
  position: number;
  created_at: string;
}

export interface Mover {
  id: string;
  user_id: string;
  driver_full_name: string;
  business_name: string;
  national_id: string;
  dl_number: string;
  dl_photo_url: string;
  vehicle_type: 'pickup' | 'lorry' | 'trailer';
  number_plate: string;
  operating_city: string;
  operating_county: string;
  phone: string;
  profile_photo_url: string;
  base_rate_kes: number;
  capacity_details: string;
  is_available: boolean;
  approval_status: 'pending_review' | 'approved' | 'rejected';
  working_days: string[];
  start_time: string;
  end_time: string;
  payment_channel: 'mpesa_send_money' | 'mpesa_paybill' | 'mpesa_lipa_na_mpesa' | 'airtel_money';
  payment_account: string;
  liability_accepted: boolean;
  reference_contacts: { name: string; phone: string; relationship: string }[];
  created_at: string;
  updated_at: string;
}

export interface Booking {
  id: string;
  renter_id: string;
  mover_id: string;
  listing_id: string | null;
  pickup_address: string;
  dropoff_address: string;
  moving_date: string;
  booking_amount: number;
  commission_amount: number;
  total_amount: number;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  payment_status: 'unpaid' | 'paid' | 'refunded';
  payment_method: string;
  created_at: string;
  updated_at: string;
}

export interface Review {
  id: string;
  reviewer_id: string;
  reviewee_id: string | null;
  listing_id: string | null;
  mover_id: string | null;
  rating: number;
  comment: string;
  review_type: 'landlord' | 'mover';
  created_at: string;
}

export interface CommunityPost {
  id: string;
  user_id: string;
  listing_id: string | null;
  content: string;
  ai_caption: string;
  post_type: 'listing' | 'manual';
  created_at: string;
}

export interface TermsAcceptance {
  id: string;
  user_id: string;
  context: 'landlord' | 'mover' | 'listing';
  accepted: boolean;
  accepted_at: string | null;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  message_type: 'text' | 'event_request' | 'event_confirmed' | 'event_declined';
  event_data: BookingEventData | null;
  created_at: string;
}

export interface BookingEventData {
  relocation_date: string;
  day_of_week: string;
  pickup_time: string;
  pickup_address: string;
  dropoff_address: string;
  negotiated_price: number;
}

export interface BookingEvent {
  id: string;
  conversation_id: string;
  renter_id: string;
  mover_id: string;
  mover_profile_id: string;
  relocation_date: string;
  day_of_week: string;
  pickup_time: string;
  pickup_address: string;
  dropoff_address: string;
  negotiated_price: number;
  commission_amount: number;
  total_amount: number;
  status: 'pending' | 'confirmed' | 'declined' | 'paid' | 'completed' | 'cancelled';
  payment_method: string;
  created_at: string;
  confirmed_at: string | null;
  paid_at: string | null;
}

// subscription type interface
export type SubscriptionStatus = 'active' | 'inactive' | 'expired' | 'cancelled';

export interface Subscription {
  id: string;
  user_id: string;
  plan: string;
  status: SubscriptionStatus;
  starts_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

// export user with subscription details
export interface UserWithSubscription extends Profile {
  subscription: Subscription | null;
}
