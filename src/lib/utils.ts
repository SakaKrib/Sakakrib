import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { supabase } from '@/lib/supabase';

/* ============================================================
 * GENERAL UTILITIES
 * ============================================================ */

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/* ============================================================
 * CURRENCY
 * ============================================================ */

export function formatKES(
  amount: number | null | undefined
): string {
  if (
    amount === null ||
    amount === undefined ||
    Number.isNaN(amount)
  ) {
    return 'KES 0';
  }

  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/* ============================================================
 * DATE / TIME
 * ============================================================ */

export function timeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();

  const seconds = Math.floor(
    (now.getTime() - date.getTime()) / 1000
  );

  if (seconds < 60) return 'just now';

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);

  if (days < 7) {
    return `${days}d ago`;
  }

  const weeks = Math.floor(days / 7);

  if (weeks < 4) {
    return `${weeks}w ago`;
  }

  const months = Math.floor(days / 30);

  if (months < 12) {
    return `${months}mo ago`;
  }

  const years = Math.floor(days / 365);

  return `${years}y ago`;
}

/* ============================================================
 * VALIDATION
 * ============================================================ */

export function validateNationalID(id: string): boolean {
  const cleaned = id.trim().replace(/\s/g, '');

  return /^\d{7,8}$/.test(cleaned);
}

export function validateDL(dl: string): boolean {
  const cleaned = dl.trim().replace(/\s/g, '');

  return /^[A-Za-z0-9]{4,10}$/.test(cleaned);
}

export function validateNumberPlate(plate: string): boolean {
  const cleaned = plate
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');

  return (
    /^K[A-Z]{2}\s?\d{3}[A-Z]?$/.test(cleaned) ||
    /^K[A-Z]{2}\s?\d{2,3}[A-Z]?$/.test(cleaned)
  );
}

export function validatePhone(phone: string): boolean {
  const cleaned = phone.trim().replace(/\s/g, '');

  return (
    /^(?:\+?254|0)?7\d{8}$/.test(cleaned) ||
    /^(?:\+?254|0)?1\d{8}$/.test(cleaned)
  );
}

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/* ============================================================
 * LOCATION DATA
 * ============================================================ */

export const KENYAN_CITIES = [
  'Nairobi',
  'Mombasa',
  'Kisumu',
  'Nakuru',
  'Eldoret',
  'Thika',
  'Malindi',
  'Kitale',
  'Garissa',
  'Kakamega',
  'Machakos',
  'Meru',
  'Nyeri',
  'Kericho',
  'Embu',
  'Voi',
  'Kilifi',
  'Naivasha',
  'Lamu',
  'Isiolo',
] as const;

export const KENYAN_COUNTIES = [
  'Baringo',
  'Bomet',
  'Bungoma',
  'Busia',
  'Elgeyo-Marakwet',
  'Embu',
  'Garissa',
  'Homa Bay',
  'Isiolo',
  'Kajiado',
  'Kakamega',
  'Kericho',
  'Kiambu',
  'Kilifi',
  'Kirinyaga',
  'Kisii',
  'Kisumu',
  'Kitui',
  'Kwale',
  'Laikipia',
  'Lamu',
  'Machakos',
  'Makueni',
  'Mandera',
  'Marsabit',
  'Meru',
  'Migori',
  'Mombasa',
  'Murang’a',
  'Nairobi',
  'Nakuru',
  'Nandi',
  'Narok',
  'Nyamira',
  'Nyandarua',
  'Nyeri',
  'Samburu',
  'Siaya',
  'Taita-Taveta',
  'Tana River',
  'Tharaka-Nithi',
  'Trans Nzoia',
  'Turkana',
  'Uasin Gishu',
  'Vihiga',
  'Wajir',
  'West Pokot',
] as const;

/* ============================================================
 * VEHICLES
 * ============================================================ */

export const VEHICLE_TYPES = [
  {
    value: 'pickup',
    label: 'Pickup Truck',
  },
  {
    value: 'lorry',
    label: 'Lorry / Canter',
  },
  {
    value: 'trailer',
    label: 'Trailer',
  },
] as const;

/* ============================================================
 * HOUSE SIZES
 * ============================================================ */

export const HOUSE_SIZES = [
  'Bedsitter',
  'Single Room',
  '1 Bedroom',
  '2 Bedrooms',
  '3 Bedrooms',
  '4 Bedrooms',
  '5 Bedrooms',
  '6+ Bedrooms',
  'Studio',
  'Custom Size',
] as const;

/* ============================================================
 * PLATFORM CONFIGURATION
 *
 * These variables are intentionally kept because existing
 * components import them.
 *
 * IMPORTANT:
 * They are NOT initialized with business values.
 *
 * Call loadPlatformConfiguration() before code that depends
 * on these values.
 * ============================================================ */

export let COMMISSION_RATE = 0;

export let LISTING_FEE_KES = 0;

export let FREE_LISTING_LIMIT = 0;

/* ============================================================
 * PLATFORM SETTINGS
 * ============================================================ */

export interface PlatformSettings {
  id: boolean;
  mover_commission_rate: number;
  mover_operational_markup_rate: number;
  created_at?: string;
  updated_at?: string;
}

/**
 * Fetch platform settings.
 *
 * Database is the source of truth.
 */
export async function getPlatformSettings(): Promise<PlatformSettings> {
  const { data, error } = await supabase
    .from('platform_settings')
    .select(`
      id,
      mover_commission_rate,
      mover_operational_markup_rate,
      created_at,
      updated_at
    `)
    .eq('id', true)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to load platform settings: ${error.message}`
    );
  }

  if (!data) {
    throw new Error(
      'Platform settings are not configured in the database.'
    );
  }

  return {
    id: Boolean(data.id),
    mover_commission_rate: Number(
      data.mover_commission_rate
    ),
    mover_operational_markup_rate: Number(
      data.mover_operational_markup_rate
    ),
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}

/* ============================================================
 * LISTING ENTITLEMENT
 * ============================================================ */

export interface ListingEntitlement {
  landlord_id: string;
  authorized_landlord: boolean;

  free_limit: number;
  free_listings_used: number;
  free_listings_remaining: number;

  individual_paid_listings: number;
  individual_listing_price_kes: number;

  can_start_listing: boolean;
  can_create: boolean;

  requires_subscription: boolean;
  requires_individual_payment: boolean;

  subscription_id: string | null;
  plan_id: string | null;
  subscription_plan: string | null;
  subscription_status: string | null;

  subscription_limit: number | null;
  max_units_per_listing: number | null;

  subscription_listings_used: number;
  subscription_listings_remaining: number | null;

  pms_access: boolean;
  upgrade_available: boolean;
  upgrade_target: string | null;
}

/**
 * Fetch authoritative landlord listing entitlement.
 *
 * The RPC is responsible for determining:
 * - free listing allowance
 * - individual listing price
 * - subscription allowance
 * - whether payment is required
 */
export async function getListingEntitlement(
  landlordId?: string
): Promise<ListingEntitlement> {
  const { data, error } = await supabase.rpc(
    'get_landlord_listing_entitlement',
    landlordId
      ? {
          p_landlord_id: landlordId,
        }
      : {}
  );

  if (error) {
    throw new Error(
      `Failed to load listing entitlement: ${error.message}`
    );
  }

  if (!data) {
    throw new Error(
      'The database did not return listing entitlement.'
    );
  }

  return {
    landlord_id: String(data.landlord_id),
    authorized_landlord: Boolean(
      data.authorized_landlord
    ),

    free_limit: Number(data.free_limit ?? 0),
    free_listings_used: Number(
      data.free_listings_used ?? 0
    ),
    free_listings_remaining: Number(
      data.free_listings_remaining ?? 0
    ),

    individual_paid_listings: Number(
      data.individual_paid_listings ?? 0
    ),

    individual_listing_price_kes: Number(
      data.individual_listing_price_kes ?? 0
    ),

    can_start_listing: Boolean(
      data.can_start_listing
    ),
    can_create: Boolean(data.can_create),

    requires_subscription: Boolean(
      data.requires_subscription
    ),
    requires_individual_payment: Boolean(
      data.requires_individual_payment
    ),

    subscription_id:
      data.subscription_id ?? null,

    plan_id:
      data.plan_id ?? null,

    subscription_plan:
      data.subscription_plan ?? null,

    subscription_status:
      data.subscription_status ?? null,

    subscription_limit:
      data.subscription_limit === null ||
      data.subscription_limit === undefined
        ? null
        : Number(data.subscription_limit),

    max_units_per_listing:
      data.max_units_per_listing === null ||
      data.max_units_per_listing === undefined
        ? null
        : Number(data.max_units_per_listing),

    subscription_listings_used: Number(
      data.subscription_listings_used ?? 0
    ),

    subscription_listings_remaining:
      data.subscription_listings_remaining === null ||
      data.subscription_listings_remaining === undefined
        ? null
        : Number(
            data.subscription_listings_remaining
          ),

    pms_access: Boolean(data.pms_access),

    upgrade_available: Boolean(
      data.upgrade_available
    ),

    upgrade_target:
      data.upgrade_target ?? null,
  };
}

/* ============================================================
 * LOAD BUSINESS CONFIGURATION
 *
 * Keeps the existing exported variable names working while
 * loading their values from Supabase.
 * ============================================================ */

export async function loadPlatformConfiguration(
  landlordId?: string
): Promise<{
  platformSettings: PlatformSettings;
  listingEntitlement: ListingEntitlement | null;
}> {
  const platformSettings =
    await getPlatformSettings();

  COMMISSION_RATE =
    platformSettings.mover_commission_rate;

  let listingEntitlement: ListingEntitlement | null =
    null;

  if (landlordId) {
    listingEntitlement =
      await getListingEntitlement(landlordId);

    FREE_LISTING_LIMIT =
      listingEntitlement.free_limit;

    LISTING_FEE_KES =
      listingEntitlement.individual_listing_price_kes;
  }

  return {
    platformSettings,
    listingEntitlement,
  };
}

/* ============================================================
 * MOVER PRICING
 * ============================================================ */

export interface MoverQuote {
  distance_km: number;
  base_rate_kes: number;
  rate_per_km_kes: number;

  operational_markup_rate: number;
  operational_markup_amount: number;

  subtotal_kes: number;

  commission_rate: number;
  commission_amount: number;

  total_amount_kes: number;
  net_mover_payable_kes: number;
}

/**
 * Get authoritative mover pricing.
 *
 * The calculation is performed by the database RPC.
 * The frontend does not independently calculate pricing.
 */
export async function getMoverQuote(
  moverId: string,
  distanceKm: number
): Promise<MoverQuote> {
  if (!moverId) {
    throw new Error('Mover ID is required.');
  }

  if (
    !Number.isFinite(distanceKm) ||
    distanceKm < 0
  ) {
    throw new Error(
      'A valid distance is required.'
    );
  }

  const { data, error } = await supabase.rpc(
    'get_mover_quote',
    {
      p_mover_id: moverId,
      p_distance_km: distanceKm,
    }
  );

  if (error) {
    throw new Error(
      `Failed to calculate mover quote: ${error.message}`
    );
  }

  const quote = Array.isArray(data)
    ? data[0]
    : data;

  if (!quote) {
    throw new Error(
      'The database did not return a mover quote.'
    );
  }

  return {
    distance_km: Number(quote.distance_km),
    base_rate_kes: Number(
      quote.base_rate_kes
    ),
    rate_per_km_kes: Number(
      quote.rate_per_km_kes
    ),

    operational_markup_rate: Number(
      quote.operational_markup_rate ?? 0
    ),

    operational_markup_amount: Number(
      quote.operational_markup_amount ?? 0
    ),

    subtotal_kes: Number(
      quote.subtotal_kes ??
        quote.booking_amount ??
        0
    ),

    commission_rate: Number(
      quote.commission_rate ?? 0
    ),

    commission_amount: Number(
      quote.commission_amount ?? 0
    ),

    total_amount_kes: Number(
      quote.total_amount_kes ??
        quote.total_amount ??
        0
    ),

    net_mover_payable_kes: Number(
      quote.net_mover_payable_kes ??
        quote.net_mover_payable ??
        0
    ),
  };
}

/* ============================================================
 * DAYS / AVAILABILITY
 * ============================================================ */

export const DAYS_OF_WEEK = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export const DAY_INDEX: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

/* ============================================================
 * TIME
 * ============================================================ */

export function formatTime(time: string): string {
  if (!time) return '';

  const [h, m] = time.split(':').map(Number);

  const period = h >= 12 ? 'PM' : 'AM';

  const hour12 =
    h === 0
      ? 12
      : h > 12
        ? h - 12
        : h;

  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

export function getDayOfWeek(
  dateStr: string
): string {
  const date = new Date(
    `${dateStr}T00:00:00`
  );

  return [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ][date.getDay()];
}

/* ============================================================
 * MOVER AVAILABILITY
 * ============================================================ */

export function isMoverAvailable(
  workingDays: string[],
  startTime: string,
  endTime: string,
  dateStr: string,
  pickupTime: string
): {
  valid: boolean;
  reason?: string;
} {
  const day = getDayOfWeek(dateStr);

  if (!workingDays.includes(day)) {
    return {
      valid: false,
      reason: `Driver is only available on ${workingDays.join(
        ', '
      )}.`,
    };
  }

  if (
    startTime &&
    endTime &&
    pickupTime
  ) {
    if (
      pickupTime < startTime ||
      pickupTime > endTime
    ) {
      return {
        valid: false,
        reason: `Driver works between ${formatTime(
          startTime
        )} and ${formatTime(
          endTime
        )} on ${day}.`,
      };
    }
  }

  return {
    valid: true,
  };
}