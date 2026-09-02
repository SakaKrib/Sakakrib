import { protectedGet } from '@/lib/djangoApi';

export interface DjangoListingDetail {
  id: string;
  user_id: string;
  title: string;
  description: string;
  city: string;
  county: string;
  location_search?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  property_name?: string | null;
  property_type?: string | null;
  price_kes: number | string | null;
  listing_type: 'rent' | 'sale' | string;
  deposit_required: boolean;
  deposit_structure?: string | null;
  deposit_amount?: number | string | null;
  size?: string | null;
  beds?: number | null;
  baths?: number | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  social_links?: unknown;
  booking_enabled?: boolean;
  payment_enabled?: boolean;
  is_property_management?: boolean;
  is_paid?: boolean;
  is_published?: boolean;
  approval_status?: string;
  is_approved?: boolean;
  status?: string;
  ai_caption?: string | null;
  ai_caption_generated_at?: string | null;
  created_at: string;
  updated_at?: string;
  media: DjangoListingMedia[];
}

export interface DjangoListingMedia {
  id: string;
  listing_id: string;
  user_id: string;
  unit_id?: string | null;
  url: string;
  label?: string | null;
  media_type: 'photo' | 'video' | string;
  position?: number;
  created_at?: string;
}

/**
 * Read-only listing detail boundary for public/authorized listing views.
 * The page can continue using its existing UI/types while the transport
 * moves from Supabase to Django.
 */
export async function getListingDetail(listingId: string): Promise<DjangoListingDetail> {
  if (!listingId) throw new Error('Listing ID is required.');
  return protectedGet<DjangoListingDetail>(`/api/listings/${encodeURIComponent(listingId)}/`);
}

export function getListingMediaUrl(media: DjangoListingMedia): string {
  return media.url;
}
