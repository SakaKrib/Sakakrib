import { supabase } from '@/lib/supabase';

/* ============================================================
 * PMS SUBSCRIPTION PAYMENTS - SHARED (LANDLORD + REAL ESTATE)
 *
 * Deliberately its own file rather than living in pmsService.ts
 * (which documents itself as landlord-only) or Realestateservice.ts
 * (subscription/listing reads, not payment initiation). PayPal
 * checkout is genuinely audience-agnostic - paypal-create-
 * subscription branches on the plan's own audience column - so it
 * belongs somewhere neutral. M-Pesa is NOT audience-agnostic: it's
 * two separate edge functions (subscription-stk for landlord,
 * real-estate-subscription-stk for real estate), each of which
 * derives the caller's identity/role from their own JWT server-side
 * - which one to call is a caller-supplied fact (the audience the
 * checkout screen is running under), not something inferred here.
 * ============================================================ */

export type PMSBillingCycle = 'MONTHLY' | 'ANNUAL';
export type PMSCheckoutAudience = 'LANDLORD' | 'REAL_ESTATE';

export interface PMSMpesaCheckoutResponse {
  success: boolean;
  error?: string;
  invoice_id?: string;
  subscription_id?: string;
  plan?: string;
  billing_cycle?: PMSBillingCycle;
  amount_kes?: number;
  checkout_request_id?: string;
  merchant_request_id?: string | null;
  customer_message?: string;
}

export interface PMSPayPalCheckoutResponse {
  success: boolean;
  error?: string;
  subscription_id?: string;
  paypal_subscription_id?: string;
  approval_url?: string | null;
  plan_name?: string;
  audience?: PMSCheckoutAudience;
  billing_cycle?: PMSBillingCycle;
}

async function authedFetch<T>(
  functionSlug: string,
  body: Record<string, unknown>
): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('Your session has expired. Please sign in again.');
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    throw new Error('Supabase configuration is missing.');
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/${functionSlug}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: anonKey,
    },
    body: JSON.stringify(body),
  });

  let data: T & { success?: boolean; error?: string };

  try {
    data = (await response.json()) as T & { success?: boolean; error?: string };
  } catch {
    throw new Error('Invalid response from payment service.');
  }

  if (!response.ok || data.success === false) {
    throw new Error(data.error || 'Unable to initiate payment.');
  }

  return data;
}

/* ============================================================
 * M-PESA
 * ============================================================ */

export async function initiateMpesaSubscriptionCheckout(
  audience: PMSCheckoutAudience,
  planId: string,
  billingCycle: PMSBillingCycle
): Promise<PMSMpesaCheckoutResponse> {
  const functionSlug =
    audience === 'REAL_ESTATE' ? 'real-estate-subscription-stk' : 'subscription-stk';

  return authedFetch<PMSMpesaCheckoutResponse>(functionSlug, {
    plan_id: planId,
    billing_cycle: billingCycle,
  });
}

/* ============================================================
 * PAYPAL
 * ============================================================ */

export async function initiatePayPalSubscriptionCheckout(
  planId: string,
  billingCycle: PMSBillingCycle
): Promise<PMSPayPalCheckoutResponse> {
  return authedFetch<PMSPayPalCheckoutResponse>('paypal-create-subscription', {
    plan_id: planId,
    billing_cycle: billingCycle,
  });
}

/* ============================================================
 * M-PESA INVOICE POLLING
 *
 * subscription_invoices RLS ("Subscription owners can view own
 * invoices") permits a direct owner-scoped select by id - verified
 * live - so no RPC wrapper is needed here, matching the pattern
 * ListingEntitlement.ts already uses for listing_payment_intents.
 * ============================================================ */

export type PMSInvoiceStatus = 'PENDING' | 'PAID' | 'FAILED';

export async function pollMpesaInvoiceStatus(
  invoiceId: string,
  { maxAttempts = 40, intervalMs = 3000 }: { maxAttempts?: number; intervalMs?: number } = {}
): Promise<PMSInvoiceStatus> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { data, error } = await supabase
      .from('subscription_invoices')
      .select('status')
      .eq('id', invoiceId)
      .maybeSingle();

    if (!error && data?.status && data.status !== 'PENDING') {
      return data.status as PMSInvoiceStatus;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return 'PENDING';
}