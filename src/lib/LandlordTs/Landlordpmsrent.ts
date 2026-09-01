import { protectedGet, protectedPost } from '@/lib/djangoApi';

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
  rent_paid_in_advance?: boolean;
  rent_paid_through_month?: string | null;
  rent_due_day?: number | null;
  payment_tracking_enabled?: boolean;
}

export interface RentSummary {
  total_units: number;
  occupied_units: number;
  vacant_units: number;
  total_renters: number;
  monthly_rent_due: number;
  monthly_rent_paid: number;
  monthly_rent_outstanding: number;
}

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

export interface MarkRentPaidResult {
  unit_id: string;
  paid_through_month: string;
  months_marked_paid: number;
  months_already_paid: number;
  months_covered: number;
  payment_provider: string;
  payment_method: string;
}

export async function getMyPMSUnits(listingId?: string): Promise<PMSUnit[]> {
  const query = listingId ? `?listing_id=${encodeURIComponent(listingId)}` : '';
  return protectedGet<PMSUnit[]>(`/api/core/rent/units/${query}`);
}

export async function getMyRentSummary(): Promise<RentSummary | null> {
  const data = await protectedGet<{ rentSummary?: RentSummary }>('/api/core/pms/dashboard/');
  return data.rentSummary ?? null;
}

export async function getUnitPaymentHistory(unitId: string): Promise<RentPaymentRecord[]> {
  if (!unitId) throw new Error('A unit is required.');
  return protectedGet<RentPaymentRecord[]>(`/api/core/rent/units/${encodeURIComponent(unitId)}/history/`);
}

export async function markUnitRentPaidThrough(unitId: string, paidThroughMonth: Date): Promise<MarkRentPaidResult> {
  if (!unitId) throw new Error('A unit is required.');
  const firstOfMonth = new Date(Date.UTC(
    paidThroughMonth.getFullYear(),
    paidThroughMonth.getMonth(),
    1,
  )).toISOString().slice(0, 10);
  return protectedPost<MarkRentPaidResult>(
    `/api/core/rent/units/${encodeURIComponent(unitId)}/paid-through/`,
    { paid_through_month: firstOfMonth },
  );
}
