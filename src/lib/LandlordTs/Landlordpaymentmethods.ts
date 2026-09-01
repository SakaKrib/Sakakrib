import { protectedDelete, protectedGet, protectedPost } from '@/lib/djangoApi';

export type PaymentMethodProvider = 'MPESA' | 'PAYPAL';
export type MpesaMethod = 'PAYBILL' | 'TILL';

export interface LandlordPaymentMethod {
  id: string;
  provider: PaymentMethodProvider;
  mpesa_method: MpesaMethod | null;
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

export type NewPaymentMethodInput =
  | { provider: 'PAYPAL'; display_name?: string | null; paypal_email: string }
  | { provider: 'MPESA'; mpesa_method: 'PAYBILL'; display_name?: string | null; paybill_number: string; paybill_account: string }
  | { provider: 'MPESA'; mpesa_method: 'TILL'; display_name?: string | null; till_number: string };

export async function getMyLandlordPaymentMethods(): Promise<LandlordPaymentMethod[]> {
  const dashboard = await protectedGet<{ paymentMethods?: LandlordPaymentMethod[] }>('/api/core/pms/dashboard/');
  return dashboard.paymentMethods ?? [];
}

export async function createLandlordPaymentMethod(input: NewPaymentMethodInput): Promise<LandlordPaymentMethod> {
  return protectedPost<LandlordPaymentMethod>('/api/core/payment-methods/', input);
}

export async function deleteLandlordPaymentMethod(id: string): Promise<void> {
  if (!id) throw new Error('A payment method is required.');
  await protectedDelete(`/api/core/payment-methods/${encodeURIComponent(id)}/`);
}

export async function setLandlordPaymentMethodDefault(id: string): Promise<void> {
  if (!id) throw new Error('A payment method is required.');
  await protectedPost('/api/core/pms/action/', {
    action: 'set_payment_method_default',
    payment_method_id: id,
  });
}
