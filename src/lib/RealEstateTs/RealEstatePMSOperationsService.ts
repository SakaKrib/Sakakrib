import { djangoRequest, protectedGet, protectedPatch, protectedPost } from '@/lib/djangoApi';

export interface RealEstatePMSUnit {
  unit_id: string;
  listing_id: string;
  listing_title: string;
  unit_number: string;
  unit_type: string;
  rent: number;
  deposit_amount: number;
  size: number | null;
  beds: number;
  baths: number;
  availability: string;
  description: string | null;
  position: number;
  payment_tracking_enabled: boolean;
  rent_due_day: number;
  rent_paid_in_advance: boolean;
  rent_paid_through_month: string | null;
  renter_name: string | null;
  renter_assoc_id: string | null;
  renter_user_id: string | null;
  renter_phone: string | null;
  renter_email: string | null;
  lease_start: string | null;
  lease_end: string | null;
}

export async function getRealEstatePMSUnits() {
  return protectedGet<RealEstatePMSUnit[]>('/api/subscriptions/real-estate/units/');
}

export async function createRealEstatePMSUnit(payload: Record<string, unknown>) {
  return protectedPost<RealEstatePMSUnit>('/api/subscriptions/real-estate/units/', payload);
}

export async function updateRealEstatePMSUnit(unitId: string, payload: Record<string, unknown>) {
  return protectedPatch<RealEstatePMSUnit>(`/api/subscriptions/real-estate/units/${unitId}/`, payload);
}

export async function deleteRealEstatePMSUnit(unitId: string) {
  return djangoRequest(`/api/subscriptions/real-estate/units/${unitId}/`, { method: 'DELETE' });
}

export async function getRealEstatePMSMedia(listingId: string) {
  return protectedGet<unknown[]>(`/api/subscriptions/real-estate/media/?listing_id=${encodeURIComponent(listingId)}`);
}

export async function uploadRealEstatePMSMedia(formData: FormData) {
  return protectedPost<unknown>('/api/subscriptions/real-estate/media/', formData);
}

export async function updateRealEstatePMSMedia(mediaId: string, payload: Record<string, unknown>) {
  return protectedPatch<unknown>(`/api/subscriptions/real-estate/media/${mediaId}/update/`, payload);
}

export async function deleteRealEstatePMSMedia(mediaId: string) {
  return djangoRequest(`/api/subscriptions/real-estate/media/${mediaId}/delete/`, { method: 'DELETE' });
}
