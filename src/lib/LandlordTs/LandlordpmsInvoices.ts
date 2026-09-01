import { protectedGet, protectedPost } from '@/lib/djangoApi';

export interface CreateInvoicePeriod { period_year: number; period_month: number; }

export interface PaymentDestination {
  id?: string;
  payment_method_id: string;
  provider: 'MPESA' | 'PAYPAL' | string;
  mpesa_method?: 'PAYBILL' | 'TILL' | string;
  display_name?: string | null;
  paybill_number?: string;
  paybill_account?: string;
  till_number?: string;
  paypal_email?: string;
}

export interface CreateInvoiceResult {
  success: boolean;
  invoice_id: string;
  invoice_number: string;
  amount_kes: number | string;
  billing_period_start: string;
  billing_period_end: string;
  due_date: string;
  payment_destination?: PaymentDestination;
  status?: string;
}

export interface RentInvoice {
  id: string;
  invoice_number: string;
  landlord_id: string;
  renter_user_id: string | null;
  renter_assoc_id: string | null;
  listing_id: string;
  unit_id: string;
  billing_period_start: string;
  billing_period_end: string;
  due_date: string;
  amount_kes: number;
  currency: string;
  status: 'DUE' | 'PAYMENT_SUBMITTED' | 'PAID' | 'REJECTED' | 'CANCELLED' | string;
  payment_method_id: string | null;
  payment_destination_snapshot: PaymentDestination | null;
  paid_at: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RentPaymentSubmission {
  id: string;
  invoice_id: string;
  renter_user_id: string | null;
  landlord_id: string;
  renter_assoc_id: string;
  unit_id: string;
  transaction_reference: string;
  status: 'PENDING' | 'CONFIRMED' | 'REJECTED' | string;
  submitted_at: string;
  confirmed_by: string | null;
  confirmed_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export type PendingConfirmation = RentPaymentSubmission & { invoice: RentInvoice };

type PMSDashboard = {
  rentInvoices?: RentInvoice[];
  pendingRentSubmissions?: RentPaymentSubmission[];
  paymentMethods?: Array<PaymentDestination & { id?: string }>;
};

const dashboard = () => protectedGet<PMSDashboard>('/api/core/pms/dashboard/');

export async function previewPaymentDestination(paymentMethodId: string, _unitId: string): Promise<PaymentDestination> {
  if (!paymentMethodId) throw new Error('Payment method is required.');
  const data = await dashboard();
  const method = (data.paymentMethods ?? []).find((item) => item.payment_method_id === paymentMethodId || item.id === paymentMethodId);
  if (!method) throw new Error('Payment method is not available.');
  return method;
}

export async function createRentInvoice(unitId: string, periods: CreateInvoicePeriod[], dueDate: string, paymentMethodId: string): Promise<CreateInvoiceResult> {
  const result = await protectedPost<Record<string, unknown>>('/api/core/invoices/landlord/', {
    unit_id: unitId, periods, due_date: dueDate, payment_method_id: paymentMethodId,
  });
  return {
    success: result.success !== false,
    invoice_id: String(result.invoice_id ?? result.id ?? ''),
    invoice_number: String(result.invoice_number ?? ''),
    amount_kes: Number(result.amount_kes ?? 0),
    billing_period_start: String(result.billing_period_start ?? ''),
    billing_period_end: String(result.billing_period_end ?? ''),
    due_date: String(result.due_date ?? dueDate),
    payment_destination: result.payment_destination as PaymentDestination | undefined,
    status: result.status ? String(result.status) : undefined,
  };
}

export async function getMyRentInvoices(): Promise<RentInvoice[]> { return (await dashboard()).rentInvoices ?? []; }

export async function getPendingPaymentConfirmations(): Promise<PendingConfirmation[]> {
  const data = await dashboard();
  const invoices = new Map((data.rentInvoices ?? []).map((invoice) => [invoice.id, invoice]));
  return (data.pendingRentSubmissions ?? []).map((submission) => {
    const invoice = invoices.get(submission.invoice_id);
    return invoice ? { ...submission, invoice } : null;
  }).filter((row): row is PendingConfirmation => row !== null);
}

export async function confirmRentPayment(submissionId: string): Promise<void> {
  if (!submissionId) throw new Error('A payment submission is required.');
  await protectedPost(`/api/core/payment-submissions/${encodeURIComponent(submissionId)}/confirm/`, {});
}

export async function rejectRentPayment(submissionId: string, reason: string): Promise<void> {
  if (!submissionId) throw new Error('A payment submission is required.');
  await protectedPost(`/api/core/payment-submissions/${encodeURIComponent(submissionId)}/reject/`, { rejection_reason: reason });
}
