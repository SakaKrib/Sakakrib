import { protectedGet, protectedPost } from '@/lib/djangoApi';
export type PMSBillingCycle = 'MONTHLY' | 'ANNUAL';
export type PMSCheckoutAudience = 'LANDLORD' | 'REAL_ESTATE';
export interface PMSMpesaCheckoutResponse { success: boolean; error?: string; detail?: string; invoice_id?: string; subscription_id?: string; listing_id?: string | null; plan?: string; plan_id?: string; billing_cycle?: PMSBillingCycle; amount_kes?: number; checkout_request_id?: string; merchant_request_id?: string | null; customer_message?: string; }
export interface PMSPayPalCheckoutResponse { success: boolean; error?: string; detail?: string; subscription_id?: string; paypal_subscription_id?: string; paypal_plan_id?: string; approval_url?: string | null; plan_name?: string; audience?: PMSCheckoutAudience; billing_cycle?: PMSBillingCycle; invoice_id?: string; listing_id?: string | null; }
export interface PMSMpesaRenewalResponse { success: boolean; error?: string; detail?: string; invoice_id?: string; subscription_id?: string; amount_kes?: number; provider_reference?: string; status?: string; renewal?: boolean; }
export interface PMSMpesaUpgradeResponse { success: boolean; error?: string; detail?: string; invoice_id?: string; subscription_id?: string; current_plan_id?: string; current_plan_name?: string; target_plan_id?: string; target_plan_name?: string; amount_kes?: number; provider_reference?: string; status?: string; upgrade?: boolean; }
export type PMSInvoiceStatus = 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED';
export async function initiateMpesaSubscriptionCheckout(audience: PMSCheckoutAudience, planId: string, billingCycle: PMSBillingCycle, phoneNumber: string, listingId?: string): Promise<PMSMpesaCheckoutResponse> {
  void audience;
  const data = await protectedPost<PMSMpesaCheckoutResponse>('/api/subscriptions/checkout/', { plan_id: planId, billing_cycle: billingCycle, provider: 'mpesa', phone_number: phoneNumber, listing_id: listingId || undefined });
  if (!data?.success) throw new Error(data?.detail || data?.error || 'Unable to initiate M-Pesa payment.');
  return data;
}
export async function initiateMpesaSubscriptionRenewal(phoneNumber?: string): Promise<PMSMpesaRenewalResponse> {
  const data = await protectedPost<PMSMpesaRenewalResponse>('/api/subscriptions/renew/', { phone_number: phoneNumber || undefined });
  if (!data?.success) throw new Error(data?.detail || data?.error || 'Unable to initiate M-Pesa subscription renewal.');
  return data;
}
export async function initiateMpesaSubscriptionUpgrade(targetPlanId: string, billingCycle: PMSBillingCycle, phoneNumber?: string): Promise<PMSMpesaUpgradeResponse> {
  const data = await protectedPost<PMSMpesaUpgradeResponse>('/api/subscriptions/upgrade/', { target_plan_id: targetPlanId, billing_cycle: billingCycle, phone_number: phoneNumber || undefined });
  if (!data?.success) throw new Error(data?.detail || data?.error || 'Unable to initiate M-Pesa subscription upgrade.');
  return data;
}
export async function initiatePayPalSubscriptionCheckout(planId: string, billingCycle: PMSBillingCycle, listingId?: string): Promise<PMSPayPalCheckoutResponse> {
  const data = await protectedPost<PMSPayPalCheckoutResponse>('/api/subscriptions/checkout/', { plan_id: planId, billing_cycle: billingCycle, provider: 'paypal', listing_id: listingId || undefined });
  if (!data?.success) throw new Error(data?.detail || data?.error || 'Unable to start PayPal subscription checkout.');
  return data;
}
export async function approvePayPalSubscription(invoiceId: string, paypalSubscriptionId: string): Promise<PMSPayPalCheckoutResponse> {
  const data = await protectedPost<PMSPayPalCheckoutResponse>('/api/subscriptions/paypal/approve/', { invoice_id: invoiceId, paypal_subscription_id: paypalSubscriptionId });
  if (!data?.success) throw new Error(data?.detail || data?.error || 'Unable to confirm PayPal subscription.');
  return data;
}
export async function pollMpesaInvoiceStatus(invoiceId: string, { maxAttempts = 40, intervalMs = 3000 }: { maxAttempts?: number; intervalMs?: number } = {}): Promise<PMSInvoiceStatus> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) { try { const data = await protectedGet<{ status: PMSInvoiceStatus }>(`/api/subscriptions/invoices/${invoiceId}/`); if (data?.status && data.status !== 'PENDING') return data.status; } catch {} await new Promise(resolve => setTimeout(resolve, intervalMs)); }
  return 'PENDING';
}
