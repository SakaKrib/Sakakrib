import { djangoRequest, protectedGet, protectedPatch, protectedPost } from '@/lib/djangoApi';

export interface RealEstatePMSLease {
  id: string;
  lease_number: string;
  real_estate_id: string;
  listing_id: string;
  unit_id: string;
  renter_assoc_id: string;
  renter_user_id: string | null;
  renter_name: string | null;
  renter_phone: string | null;
  renter_email: string | null;
  lease_start: string;
  lease_end: string | null;
  monthly_rent_kes: number;
  deposit_amount_kes: number;
  rent_due_day: number;
  status: 'PENDING' | 'ACTIVE' | 'ENDED' | 'CANCELLED';
  renewal_notice_days: number;
  notes: string | null;
  created_by_id: string;
  created_at: string;
  updated_at: string;
}

export async function getRealEstatePMSLeases() {
  return protectedGet<RealEstatePMSLease[]>('/api/subscriptions/real-estate/leases/');
}

export async function getRealEstatePMSLease(leaseId: string) {
  return protectedGet<RealEstatePMSLease>(`/api/subscriptions/real-estate/leases/${leaseId}/`);
}

export async function createRealEstatePMSLease(payload: Record<string, unknown>) {
  return protectedPost<RealEstatePMSLease>('/api/subscriptions/real-estate/leases/', payload);
}

export async function updateRealEstatePMSLease(leaseId: string, payload: Record<string, unknown>) {
  return protectedPatch<RealEstatePMSLease>(`/api/subscriptions/real-estate/leases/${leaseId}/`, payload);
}

export async function cancelRealEstatePMSLease(leaseId: string) {
  return protectedPatch<RealEstatePMSLease>(`/api/subscriptions/real-estate/leases/${leaseId}/`, { status: 'CANCELLED' });
}

export async function deleteRealEstatePMSLease(leaseId: string) {
  return djangoRequest(`/api/subscriptions/real-estate/leases/${leaseId}/`, { method: 'DELETE' });
}

export async function createRealEstatePMSLeaseInvoice(leaseId: string, year?: number, month?: number) {
  return protectedPost<Record<string, unknown>>(`/api/subscriptions/real-estate/leases/${leaseId}/invoice/`, {
    ...(year ? { year } : {}),
    ...(month ? { month } : {}),
  });
}
