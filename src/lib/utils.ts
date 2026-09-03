import { clsx, type ClassValue } from 'clsx';

import { twMerge } from 'tailwind-merge';

import {
  protectedGet,
  protectedPost,
} from '@/lib/djangoLegacyApi';

import type { ListingEntitlement } from './ListingEntitlement';

// ============================================================
// TYPES
// ============================================================

export type ListingRole = 'landlord' | 'real_estate';

// ============================================================
// GENERAL UTILITIES
// ============================================================

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

// ============================================================
// CURRENCY
// ============================================================

export function formatKES(
  amount: number | null | undefined,
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

// ============================================================
// DATE / TIME
// ============================================================

export function timeAgo(dateString: string): string {
  const date = new Date(dateString);

  const now = new Date();

  const seconds = Math.floor(
    (now.getTime() - date.getTime()) / 1000,
  );

  if (seconds < 60) {
    return 'just now';
  }

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

// ============================================================
// VALIDATION
// ============================================================

export function validateNationalID(id: string): boolean {
  const cleaned = id.trim().replace(/\s/g, '');

  return /^\d{7,8}$/.test(cleaned);
}

export function validateDL(dl: string): boolean {
  const cleaned = dl.trim().replace(/\s/g, '');

  return /^[A-Za-z0-9]{4,10}$/.test(cleaned);
}

export function validateNumberPlate(
  plate: string,
): boolean {
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
  const cleaned = phone
    .trim()
    .replace(/\s/g, '');

  return (
    /^(?:\+254|0)?7\d{8}$/.test(cleaned) ||
    /^(?:\+254|0)?1\d{8}$/.test(cleaned)
  );
}

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    email.trim(),
  );
}

export function validateKenyanMobilePhone(
  phone: string
): boolean {
  const cleaned = phone
    .trim()
    .replace(/\s/g, '');

  return /^(?:\+254|0)?[17]\d{8}$/.test(cleaned);
}

export function validateMpesaPaybill(
  paybill: string
): boolean {
  const cleaned = paybill
    .trim()
    .replace(/\s/g, '');

  return /^\d{5,6}$/.test(cleaned);
}

export function validateMpesaTill(
  till: string
): boolean {
  const cleaned = till
    .trim()
    .replace(/\s/g, '');

  return /^\d{5,8}$/.test(cleaned);
}

// ============================================================
// LOCATION DATA
// ============================================================

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

// ============================================================
// VEHICLES
// ============================================================

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

// ============================================================
// HOUSE SIZES
// ============================================================

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

// ============================================================
// PLATFORM CONFIGURATION
// ============================================================

/**
 * Backwards-compatible convenience exports.
 *
 * These values are populated by loadPlatformConfiguration().
 * They are NOT authoritative until configuration has been loaded.
 *
 * Entitlement decisions must come from the role-specific RPC.
 */

export let COMMISSION_RATE = 0;

export let LISTING_FEE_KES = 0;

export let FREE_LISTING_LIMIT = 0;

// ============================================================
// PLATFORM SETTINGS
// ============================================================

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
 * Database remains the source of truth.
 */

export async function getPlatformSettings(): Promise<PlatformSettings> {
  const data = await protectedGet<PlatformSettings[]>(
    '/rest/v1/platform_settings' +
      '?select=id,mover_commission_rate,mover_operational_markup_rate,created_at,updated_at' +
      '&id=eq.true',
  );

  const row = data?.[0];

  if (!row) {
    throw new Error(
      'Platform settings are not configured in the database.',
    );
  }

  const moverCommissionRate = Number(
    row.mover_commission_rate,
  );

  const moverOperationalMarkupRate = Number(
    row.mover_operational_markup_rate,
  );

  if (!Number.isFinite(moverCommissionRate)) {
    throw new Error(
      'Platform settings: mover_commission_rate is invalid.',
    );
  }

  if (!Number.isFinite(moverOperationalMarkupRate)) {
    throw new Error(
      'Platform settings: mover_operational_markup_rate is invalid.',
    );
  }

  return {
    id: Boolean(row.id),

    mover_commission_rate:
      moverCommissionRate,

    mover_operational_markup_rate:
      moverOperationalMarkupRate,

    created_at: row.created_at,

    updated_at: row.updated_at,
  };
}


// ============================================================
// RAW ENTITLEMENT RESPONSE
// ============================================================

/**
 * Database/RPC response.
 *
 * Values are intentionally unknown because PostgREST/Supabase
 * can return numeric values as strings depending on the column
 * and RPC response.
 */

type RawListingEntitlement = {
  landlord_id?: unknown;

  real_estate_id?: unknown;

  authorized_landlord?: unknown;

  authorized_real_estate?: unknown;

  free_limit?: unknown;

  free_listings_used?: unknown;

  free_listings_remaining?: unknown;

  individual_paid_listings?: unknown;

  individual_listing_price_kes?: unknown;

  can_start_listing?: unknown;

  can_create?: unknown;

  requires_subscription?: unknown;

  requires_individual_payment?: unknown;

  subscription_id?: unknown;

  plan_id?: unknown;

  subscription_plan?: unknown;

  subscription_status?: unknown;

  subscription_limit?: unknown;

  subscription_listings_used?: unknown;

  subscription_listings_remaining?: unknown;

  max_units_per_listing?: unknown;

  pms_access?: unknown;

  upgrade_available?: unknown;

  upgrade_target?: unknown;

  reason?: unknown;
};

// ============================================================
// NORMALIZATION HELPERS
// ============================================================

function normalizeBoolean(
  value: unknown,
  fallback = false,
): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (normalized === 'true' || normalized === 't') {
      return true;
    }

    if (normalized === 'false' || normalized === 'f') {
      return false;
    }

    if (normalized === '1') {
      return true;
    }

    if (normalized === '0') {
      return false;
    }
  }

  return fallback;
}

function normalizeSubscriptionStatus(
  value: unknown,
): ListingEntitlement['subscriptionStatus'] {
  if (typeof value !== 'string') {
    return 'none';
  }

  switch (value.toLowerCase()) {
    case 'trial':
      return 'trial';

    case 'active':
      return 'active';

    case 'expired':
      return 'expired';

    case 'none':

    default:
      return 'none';
  }
}

function nullableString(
  value: unknown,
): string | null {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }

  return String(value);
}

function nullableNumber(
  value: unknown,
): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

function numberValue(
  value: unknown,
  fallback = 0,
): number {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

// ============================================================
// NORMALIZE ENTITLEMENT
// ============================================================

/**
 * The two role-specific RPCs return the same entitlement
 * structure. Only the role changes.
 */

function normalizeListingEntitlement(
  raw: RawListingEntitlement,
  role: ListingRole,
): ListingEntitlement {
  return {
    role,

    canStartListing: normalizeBoolean(
      raw.can_start_listing,
    ),

    canCreate: normalizeBoolean(
      raw.can_create,
    ),

    requiresSubscription: normalizeBoolean(
      raw.requires_subscription,
    ),

    requiresIndividualPayment: normalizeBoolean(
      raw.requires_individual_payment,
    ),

    free_limit: numberValue(
      raw.free_limit,
    ),

    free_listings_used: numberValue(
      raw.free_listings_used,
    ),

    free_listings_remaining: numberValue(
      raw.free_listings_remaining,
    ),

    subscriptionId: nullableString(
      raw.subscription_id,
    ),

    subscriptionPlan: nullableString(
      raw.subscription_plan,
    ),

    subscriptionStatus:
      normalizeSubscriptionStatus(
        raw.subscription_status,
      ),

    subscriptionLimit: nullableNumber(
      raw.subscription_limit,
    ),

    subscriptionListingsUsed: numberValue(
      raw.subscription_listings_used,
    ),

    subscriptionListingsRemaining:
      nullableNumber(
        raw.subscription_listings_remaining,
      ),

    individualPaidListings: numberValue(
      raw.individual_paid_listings,
    ),

    individualListingPriceKes:
      numberValue(
        raw.individual_listing_price_kes,
        1000,
      ),

    pmsAccess: normalizeBoolean(
      raw.pms_access,
    ),

    upgradeAvailable: normalizeBoolean(
      raw.upgrade_available,
    ),

    upgradeTarget: nullableString(
      raw.upgrade_target,
    ),
  };
}

// ============================================================
// LANDLORD LISTING ENTITLEMENT
// ============================================================

export async function getLandlordListingEntitlement(
  landlordId?: string,
): Promise<ListingEntitlement> {
  const payload = landlordId
    ? {
        p_landlord_id: landlordId,
      }
    : {};

  const response = await protectedPost<
    RawListingEntitlement |
    RawListingEntitlement[]
  >(
    '/rest/v1/rpc/get_landlord_listing_entitlement',
    payload,
  );

  const raw = Array.isArray(response)
    ? response[0]
    : response;

  if (!raw) {
    throw new Error(
      'The database did not return landlord listing entitlement.',
    );
  }

  if (
    normalizeBoolean(
      raw.authorized_landlord,
      true,
    ) === false
  ) {
    throw new Error(
      typeof raw.reason === 'string'
        ? raw.reason
        : 'This account is not authorized for landlord listings.',
    );
  }

  return normalizeListingEntitlement(
    raw,
    'landlord',
  );
}

// ============================================================
// REAL ESTATE LISTING ENTITLEMENT
// ============================================================

export async function getRealEstateListingEntitlement(
  realEstateId?: string,
): Promise<ListingEntitlement> {
  const payload = realEstateId
    ? {
        p_real_estate_id: realEstateId,
      }
    : {};

  const response = await protectedPost<
    RawListingEntitlement |
    RawListingEntitlement[]
  >(
    '/rest/v1/rpc/get_real_estate_listing_entitlement',
    payload,
  );

  const raw = Array.isArray(response)
    ? response[0]
    : response;

  if (!raw) {
    throw new Error(
      'The database did not return real estate listing entitlement.',
    );
  }

  if (
    normalizeBoolean(
      raw.authorized_real_estate,
      true,
    ) === false
  ) {
    throw new Error(
      typeof raw.reason === 'string'
        ? raw.reason
        : 'This account is not authorized for real estate listings.',
    );
  }

  return normalizeListingEntitlement(
    raw,
    'real_estate',
  );
}

// ============================================================
// ROLE-AWARE LISTING ENTITLEMENT
// ============================================================

export async function getListingEntitlement(
  role: ListingRole,
  userId?: string,
): Promise<ListingEntitlement> {
  if (role === 'landlord') {
    return getLandlordListingEntitlement(
      userId,
    );
  }

  if (role === 'real_estate') {
    return getRealEstateListingEntitlement(
      userId,
    );
  }

  throw new Error(
    `Unsupported listing role: ${String(role)}`,
  );
}

// ============================================================
// LOAD BUSINESS CONFIGURATION
// ============================================================

/**
 * Load platform configuration plus the correct
 * role-specific listing entitlement.
 *
 * The role MUST be supplied.
 *
 * This prevents a real-estate account from accidentally
 * receiving landlord entitlement information.
 */

export async function loadPlatformConfiguration(
  role: ListingRole,
  userId?: string,
): Promise<{
  platformSettings: PlatformSettings;

  listingEntitlement: ListingEntitlement | null;
}> {
  if (
    role !== 'landlord' &&
    role !== 'real_estate'
  ) {
    throw new Error(
      `Invalid listing role: ${String(role)}`,
    );
  }

  const platformSettings =
    await getPlatformSettings();

  COMMISSION_RATE =
    platformSettings.mover_commission_rate;

  let listingEntitlement:
    | ListingEntitlement
    | null = null;

  if (userId) {
    listingEntitlement =
      await getListingEntitlement(
        role,
        userId,
      );

    FREE_LISTING_LIMIT =
      listingEntitlement.free_limit;

    LISTING_FEE_KES =
      listingEntitlement.individualListingPriceKes;
  }

  console.log('CONFIG DEBUG', {
    role,
    userId,
    platformSettings,
    listingEntitlement,
    commissionRateFromSettings:
      platformSettings?.mover_commission_rate,
    individualListingPriceKes:
      listingEntitlement?.individualListingPriceKes,
    freeLimit:
      listingEntitlement?.free_limit,
  });

  return {
    platformSettings,
    listingEntitlement,
  };
}

// ============================================================
// MOVER PRICING
// ============================================================

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

type RawMoverQuote = Partial<MoverQuote> & {
  booking_amount?: unknown;

  total_amount?: unknown;

  net_mover_payable?: unknown;
};

/**
 * Get authoritative mover pricing.
 *
 * Calculation is performed by the database RPC.
 */

export async function getMoverQuote(
  moverId: string,
  distanceKm: number,
): Promise<MoverQuote> {
  if (!moverId) {
    throw new Error(
      'Mover ID is required.',
    );
  }

  if (
    !Number.isFinite(distanceKm) ||
    distanceKm < 0
  ) {
    throw new Error(
      'A valid distance is required.',
    );
  }

  const response = await protectedPost<
    RawMoverQuote |
    RawMoverQuote[]
  >(
    '/rest/v1/rpc/get_mover_quote',
    {
      p_mover_id: moverId,
      p_distance_km: distanceKm,
    },
  );

  const quote = Array.isArray(response)
    ? response[0]
    : response;

  if (!quote) {
    throw new Error(
      'The database did not return a mover quote.',
    );
  }

  return {
    distance_km: numberValue(
      quote.distance_km,
    ),

    base_rate_kes: numberValue(
      quote.base_rate_kes,
    ),

    rate_per_km_kes: numberValue(
      quote.rate_per_km_kes,
    ),

    operational_markup_rate:
      numberValue(
        quote.operational_markup_rate,
      ),

    operational_markup_amount:
      numberValue(
        quote.operational_markup_amount,
      ),

    subtotal_kes: numberValue(
      quote.subtotal_kes ??
        quote.booking_amount,
    ),

    commission_rate: numberValue(
      quote.commission_rate,
    ),

    commission_amount: numberValue(
      quote.commission_amount,
    ),

    total_amount_kes: numberValue(
      quote.total_amount_kes ??
        quote.total_amount,
    ),

    net_mover_payable_kes:
      numberValue(
        quote.net_mover_payable_kes ??
          quote.net_mover_payable,
      ),
  };
}

// ============================================================
// DAYS / AVAILABILITY
// ============================================================

export const DAYS_OF_WEEK = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export const DAY_INDEX: Record<
  string,
  number
> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

// ============================================================
// TIME
// ============================================================

export function formatTime(
  time: string,
): string {
  if (!time) {
    return '';
  }

  const [h, m] = time
    .split(':')
    .map(Number);

  const period = h >= 12
    ? 'PM'
    : 'AM';

  const hour12 =
    h === 0
      ? 12
      : h > 12
        ? h - 12
        : h;

  return `${hour12}:${String(
    m,
  ).padStart(2, '0')} ${period}`;
}

export function getDayOfWeek(
  dateStr: string,
): string {
  const date = new Date(
    `${dateStr}T00:00:00`,
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

// ============================================================
// MOVER AVAILABILITY
// ============================================================

export function isMoverAvailable(
  workingDays: string[],
  startTime: string,
  endTime: string,
  dateStr: string,
  pickupTime: string,
): {
  valid: boolean;
  reason?: string;
} {
  const day = getDayOfWeek(dateStr);

  if (!workingDays.includes(day)) {
    return {
      valid: false,
      reason:
        `Driver is only available on ${workingDays.join(
          ', ',
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
        reason:
          `Driver works between ${formatTime(
            startTime,
          )} and ${formatTime(
            endTime,
          )} on ${day}.`,
      };
    }
  }

  return {
    valid: true,
  };
};