import { protectedGet, protectedPost } from '@/lib/djangoApi';

export type PMSBillingCycle = 'MONTHLY' | 'ANNUAL';
export type PMSCheckoutAudience = 'LANDLORD' | 'REAL_ESTATE';

export interface PMSMpesaCheckoutResponse { success: boolean; error?: string; detail?: string; invoice_id?: string; subscription_id?: string; plan?: string; billing_cycle?: PMSBillingCycle; amount_kes?: number; checkout_request_id?: string; merchant_request_id?: string | null; customer_message?: string; }
export interface PMSPayPalCheckoutResponse { success: boolean; error?: string; detail?: string; subscription_id?: string; paypal_subscription_id?: string; approval_url?: string | null; plan_name?: string; audience?: PMSCheckoutAudience; billing_cycle?: PMSBillingCycle; invoice_id?: string; }
export type PMSInvoiceStatus = 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED';

export async function initiateMpesaSubscriptionCheckout(audience: PMSCheckoutAudience, planId: string, billingCycle: PMSBillingCycle): Promise<PMSMpesaCheckoutResponse> {
  void audience;
  const data = await protectedPost<PMSMpesaCheckoutResponse>('/api/subscriptions/checkout/', {
    plan_id: planId,
    billing_cycle: billingCycle,
    provider: 'mpesa',
  });
  if (!data?.success) throw new Error(data?.detail || data?.error || 'Unable to initiate M-Pesa payment.');
  return data;
}

export async function initiatePayPalSubscriptionCheckout(planId: string, billingCycle: PMSBillingCycle): Promise<PMSPayPalCheckoutResponse> {
  const data = await protectedPost<PMSPayPalCheckoutResponse>('/api/subscriptions/checkout/', {
    plan_id: planId,
    billing_cycle: billingCycle,
    provider: 'paypal',
  });
  if (!data?.success) throw new Error(data?.detail || data?.error || 'Unable to initiate PayPal subscription checkout.');
  return data;
}

export async function pollMpesaInvoiceStatus(invoiceId: string, { maxAttempts = 40, intervalMs = 3000 }: { maxAttempts?: number; intervalMs?: number } = {}): Promise<PMSInvoiceStatus> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const data = await protectedGet<{ status: PMSInvoiceStatus }>(`/api/subscriptions/invoices/${invoiceId}/`);
      if (data?.status && data.status !== 'PENDING') return data.status;
    } catch {
      // Keep polling; Django remains authoritative and transient reads must not
      // turn a valid payment into a false failure state.
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  return 'PENDING';
}
