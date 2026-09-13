import { protectedGet, protectedPost } from '@/lib/djangoApi';

export interface RealEstatePMSFinanceData {
  summary: {
    units: number;
    invoices: number;
    total_invoiced_kes: number;
    total_paid_kes: number;
    total_due_kes: number;
    pending_submissions: number;
  };
  invoices: Array<{
    id: string;
    invoice_number: string;
    unit_id: string;
    listing_id: string;
    renter_user_id: string;
    amount_kes: number;
    currency: string;
    status: string;
    billing_period_start: string;
    billing_period_end: string;
    due_date: string;
    payment_method: string | null;
    transaction_reference: string | null;
    payment_date: string | null;
    paid_at: string | null;
    created_at: string;
  }>;
  payment_submissions: Array<{
    id: string;
    invoice_id: string;
    unit_id: string;
    transaction_reference: string;
    payment_method: string | null;
    payment_date: string | null;
    status: string;
    submitted_at: string;
    rejection_reason: string | null;
  }>;
  pms_role: string;
}

export async function getRealEstatePMSFinance() {
  return protectedGet<RealEstatePMSFinanceData>('/api/subscriptions/real-estate/finance/');
}

export async function createRealEstatePMSInvoice(payload: Record<string, unknown>) {
  return protectedPost<{ id: string; invoice_number: string; status: string }>('/api/subscriptions/real-estate/finance/', payload);
}
