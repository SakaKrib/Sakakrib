import { djangoRequest, protectedGet, protectedPatch, protectedPost } from '@/lib/djangoApi';

export type RealEstatePaymentProvider = 'MPESA' | 'PAYPAL';
export type RealEstateMpesaMethod = 'PAYBILL' | 'TILL';

export interface RealEstatePaymentMethod {
  id: string;
  provider: RealEstatePaymentProvider | string;
  mpesa_method: RealEstateMpesaMethod | null;
  display_name: string | null;
  paybill_number: string | null;
  paybill_account: string | null;
  till_number: string | null;
  paypal_email: string | null;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const endpoint = '/api/core/payment-methods/';

export async function getRealEstatePMSPaymentMethods() {
  return protectedGet<RealEstatePaymentMethod[]>(endpoint);
}

export async function createRealEstatePMSPaymentMethod(payload: Record<string, unknown>) {
  return protectedPost<RealEstatePaymentMethod>(endpoint, payload);
}

export async function updateRealEstatePMSPaymentMethod(id: string, payload: Record<string, unknown>) {
  return protectedPatch<RealEstatePaymentMethod>(`${endpoint}${encodeURIComponent(id)}/`, payload);
}

export async function deleteRealEstatePMSPaymentMethod(id: string) {
  return djangoRequest<{ success: boolean }>(`${endpoint}${encodeURIComponent(id)}/`, {
    method: 'DELETE',
  });
}
