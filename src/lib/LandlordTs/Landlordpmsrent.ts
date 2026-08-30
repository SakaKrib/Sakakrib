import { supabase } from './ Protectedsupabase';

/* ============================================================
 * TYPES
 *
 * Verified directly against live RPC/table definitions — see
 * comments per field for the source. Do not rename fields without
 * re-checking the live schema.
 * ============================================================ */

// Matches get_my_pms_units(p_listing_id)'s row shape exactly.
export interface PMSUnit {
  unit_id: string;
  listing_id: string;
  listing_title: string;
  unit_number: string;
  unit_type: string;
  rent: number;
  beds: number | null;
  baths: number | null;
  availability: string;
  renter_name: string | null;
  renter_assoc_id: string | null;
  renter_phone: string | null;
  renter_email: string | null;
  lease_start: string | null;
  lease_end: string | null;
  assoc_status: string | null;

  // NOT part of get_my_pms_units's own return columns — that RPC
  // doesn't expose rent-advance state. Populated separately from a
  // direct property_units query (RLS-permitted: user_id = auth.uid())
  // and merged in client-side by unit_id. This is the documented
  // exception in the spec ("unless the existing RPC cannot provide
  // the required data") — advance status genuinely isn't in the RPC.
  rent_paid_in_advance?: boolean;
  rent_paid_through_month?: string | null;
  rent_due_day?: number | null;
  payment_tracking_enabled?: boolean;
}

// Exact shape requested from property_units for rent-tracking state.
// The protectedSupabase compatibility shim is generic, so this type
// preserves the selected row shape through the cookie-based query.
interface PropertyUnitRentTracking {
  id: string;
  rent_paid_in_advance: boolean;
  rent_paid_through_month: string | null;
  rent_due_day: number;
  payment_tracking_enabled: boolean;
}

// Matches get_my_rent_summary()'s row shape exactly.
export interface RentSummary {
  total_units: number;
  occupied_units: number;
  vacant_units: number;
  total_renters: number;
  monthly_rent_due: number;
  monthly_rent_paid: number;
  monthly_rent_outstanding: number;
}

// rent_payments columns, per mark_unit_rent_paid_through's own
// INSERT statement (verified) — used for read-only payment history,
// queried directly since no landlord-facing RPC wraps this table
// and RLS already permits it (rent_payments: landlord_id = auth.uid()).
export interface RentPaymentRecord {
  id: string;
  renter_assoc_id: string;
  unit_id: string;
  amount_kes: number;
  period_year: number;
  period_month: number;
  status: string;
  paid_at: string | null;
  payment_provider: string | null;
  payment_method: string | null;
}

// Matches mark_unit_rent_paid_through's jsonb return exactly.
export interface MarkRentPaidResult {
  unit_id: string;
  paid_through_month: string;
  months_marked_paid: number;
  months_already_paid: number;
  months_covered: number;
  payment_provider: string;
  payment_method: string;
}

/* ============================================================
 * UNITS
 * ============================================================ */

export async function getMyPMSUnits(
  listingId?: string
): Promise<PMSUnit[]> {
  const { data, error } = await supabase.rpc('get_my_pms_units', {
    p_listing_id: listingId ?? null,
  });

  if (error) {
    throw new Error(error.message || 'Unable to load units.');
  }

  const units = (data ?? []) as PMSUnit[];

  if (units.length === 0) {
    return [];
  }

  // Supplement with advance-payment state, which get_my_pms_units
  // does not return (see PMSUnit.rent_paid_in_advance comment).
  const unitIds = units.map((u) => u.unit_id);

  const { data: advanceRows, error: advanceError } = await supabase
    .from<PropertyUnitRentTracking>('property_units')
    .select(
      'id, rent_paid_in_advance, rent_paid_through_month, rent_due_day, payment_tracking_enabled'
    )
    .in('id', unitIds);

  if (advanceError) {
    console.error(
      'Unable to load rent-advance status for units:',
      advanceError
    );
    return units;
  }

  const advanceById = new Map(
    (advanceRows ?? []).map((row) => [row.id, row])
  );

  return units.map((unit) => {
    const advance = advanceById.get(unit.unit_id);

    return {
      ...unit,
      rent_paid_in_advance: advance?.rent_paid_in_advance ?? false,
      rent_paid_through_month:
        advance?.rent_paid_through_month ?? null,
      rent_due_day: advance?.rent_due_day ?? null,
      payment_tracking_enabled:
        advance?.payment_tracking_enabled ?? false,
    };
  });
}

/* ============================================================
 * RENT SUMMARY
 * ============================================================ */

export async function getMyRentSummary(): Promise<RentSummary | null> {
  const { data, error } = await supabase.rpc('get_my_rent_summary');

  if (error) {
    throw new Error(error.message || 'Unable to load rent summary.');
  }

  const row = Array.isArray(data) ? data[0] : data;

  if (!row) return null;

  return {
    total_units: Number(row.total_units ?? 0),
    occupied_units: Number(row.occupied_units ?? 0),
    vacant_units: Number(row.vacant_units ?? 0),
    total_renters: Number(row.total_renters ?? 0),
    monthly_rent_due: Number(row.monthly_rent_due ?? 0),
    monthly_rent_paid: Number(row.monthly_rent_paid ?? 0),
    monthly_rent_outstanding: Number(row.monthly_rent_outstanding ?? 0),
  };
}

/* ============================================================
 * PAYMENT HISTORY
 *
 * No landlord-facing RPC wraps rent_payments for read access —
 * get_my_rent_payable_periods is renter-scoped only (renter_user_id
 * = auth.uid()), it cannot be called by the landlord for a renter's
 * periods. Querying rent_payments directly instead: RLS already
 * permits this (landlord_id = auth.uid()), so this is using the
 * existing, already-authorized data layer rather than inventing one.
 * ============================================================ */

export async function getUnitPaymentHistory(
  unitId: string
): Promise<RentPaymentRecord[]> {
  const { data, error } = await supabase
    .from<RentPaymentRecord>('rent_payments')
    .select(
      'id, renter_assoc_id, unit_id, amount_kes, period_year, period_month, status, paid_at, payment_provider, payment_method'
    )
    .eq('unit_id', unitId)
    .order('period_year', { ascending: false })
    .order('period_month', { ascending: false });

  if (error) {
    throw new Error(
      error.message || 'Unable to load payment history.'
    );
  }

  return (data ?? []) as RentPaymentRecord[];
}

/* ============================================================
 * MARK RENT PAID THROUGH (rent-in-advance)
 *
 * p_paid_through_month must be the first day of a month (the RPC
 * enforces this server-side and rejects otherwise). Capped at 12
 * consecutive months per call, cannot be earlier than the current
 * month, and rejects if any covered period already has a non-paid
 * rent_payments row — all enforced server-side, not duplicated here.
 * ============================================================ */

export async function markUnitRentPaidThrough(
  unitId: string,
  paidThroughMonth: Date
): Promise<MarkRentPaidResult> {
  const firstOfMonth = new Date(
    Date.UTC(
      paidThroughMonth.getFullYear(),
      paidThroughMonth.getMonth(),
      1
    )
  )
    .toISOString()
    .slice(0, 10);

  const { data, error } = await supabase.rpc(
    'mark_unit_rent_paid_through',
    {
      p_unit_id: unitId,
      p_paid_through_month: firstOfMonth,
    }
  );

  if (error) {
    throw new Error(
      error.message || 'Unable to update rent status.'
    );
  }

  if (!data) {
    throw new Error(
      'The rent status update completed but returned no result.'
    );
  }

  return data as MarkRentPaidResult;
}