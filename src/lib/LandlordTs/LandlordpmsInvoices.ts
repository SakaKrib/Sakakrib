import { supabase } from '../supabase';

/* ============================================================
 * TYPES — verified live against create_rent_invoice,
 * get_rent_payment_destination, confirm_rent_payment,
 * reject_rent_payment, and the rent_invoices / rent_invoice_periods /
 * rent_payment_submissions table schemas.
 * ============================================================ */

export interface CreateInvoicePeriod {
  period_year: number;
  period_month: number;
}

export interface CreateInvoiceResult {
  success: boolean;
  invoice_id: string;
  invoice_number: string;
  amount_kes: number;
  billing_period_start: string;
  billing_period_end: string;
  due_date: string;
  payment_destination: PaymentDestination;
}

export interface PaymentDestination {
  payment_method_id: string;
  provider: 'MPESA' | 'PAYPAL';
  mpesa_method?: 'PAYBILL' | 'TILL';
  display_name?: string | null;
  paybill_number?: string;
  paybill_account?: string;
  till_number?: string;
  paypal_email?: string;
}

// Matches rent_invoices columns exactly.
export interface RentInvoice {
  id: string;
  invoice_number: string;
  landlord_id: string;
  renter_user_id: string;
  renter_assoc_id: string;
  listing_id: string;
  unit_id: string;
  billing_period_start: string;
  billing_period_end: string;
  due_date: string;
  amount_kes: number;
  currency: string;
  status:
    | 'DUE'
    | 'PAYMENT_SUBMITTED'
    | 'PAID'
    | 'REJECTED'
    | 'CANCELLED';
  payment_method_id: string | null;
  payment_destination_snapshot: PaymentDestination | null;
  paid_at: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
}

// Matches rent_payment_submissions columns exactly.
export interface RentPaymentSubmission {
  id: string;
  invoice_id: string;
  renter_user_id: string;
  landlord_id: string;
  renter_assoc_id: string;
  unit_id: string;
  transaction_reference: string;
  status: 'PENDING' | 'CONFIRMED' | 'REJECTED';
  submitted_at: string;
  confirmed_by: string | null;
  confirmed_at: string | null;
  rejection_reason: string | null;
}

// A pending confirmation joined with enough invoice context to review
// it without a separate round trip per row.
export interface PendingConfirmation extends RentPaymentSubmission {
  invoice: RentInvoice;
}

/* ============================================================
 * PAYMENT DESTINATION PREVIEW
 * ============================================================ */

export async function previewPaymentDestination(
  paymentMethodId: string,
  unitId: string
): Promise<PaymentDestination> {
  const { data, error } = await supabase.rpc(
    'get_rent_payment_destination',
    {
      p_payment_method_id: paymentMethodId,
      p_unit_id: unitId,
    }
  );

  if (error) {
    throw new Error(
      error.message || 'Unable to verify payment destination.'
    );
  }

  return data as PaymentDestination;
}

/* ============================================================
 * CREATE INVOICE
 *
 * Renter and rent amount are derived entirely server-side from the
 * unit's active renter_unit_associations row and property_units.rent
 * — never passed from the client. Periods must be consecutive and
 * capped at 24 months by the RPC itself.
 * ============================================================ */

export async function createRentInvoice(
  unitId: string,
  periods: CreateInvoicePeriod[],
  dueDate: string,
  paymentMethodId: string
): Promise<CreateInvoiceResult> {
  const { data, error } = await supabase.rpc('create_rent_invoice', {
    p_unit_id: unitId,
    p_periods: periods,
    p_due_date: dueDate,
    p_payment_method_id: paymentMethodId,
  });

  if (error) {
    throw new Error(error.message || 'Unable to create invoice.');
  }

  const result = data as CreateInvoiceResult;

  if (!result?.success) {
    throw new Error('The invoice could not be created.');
  }

  return result;
}

/* ============================================================
 * LIST INVOICES
 *
 * No dedicated "list my invoices" RPC — rent_invoices RLS already
 * permits the landlord to read their own rows directly
 * (landlord_id = auth.uid(), verified), so this queries the table
 * directly rather than inventing an RPC.
 * ============================================================ */

export async function getMyRentInvoices(): Promise<RentInvoice[]> {
  const { data, error } = await supabase
    .from('rent_invoices')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message || 'Unable to load invoices.');
  }

  return (data ?? []) as RentInvoice[];
}

/* ============================================================
 * PENDING PAYMENT CONFIRMATIONS
 *
 * Same reasoning as above — rent_payment_submissions RLS already
 * permits landlord_id = auth.uid() reads (verified). Joined
 * client-side with the invoice since Supabase's embedded-relation
 * syntax isn't assumed here without confirming an FK relationship
 * name; two queries merged by invoice_id is simple and reliable.
 * ============================================================ */

export async function getPendingPaymentConfirmations(): Promise<
  PendingConfirmation[]
> {
  const { data: submissions, error: subError } = await supabase
    .from('rent_payment_submissions')
    .select('*')
    .eq('status', 'PENDING')
    .order('submitted_at', { ascending: true });

  if (subError) {
    throw new Error(
      subError.message || 'Unable to load pending payment confirmations.'
    );
  }

  const rows = (submissions ?? []) as RentPaymentSubmission[];

  if (rows.length === 0) {
    return [];
  }

  const invoiceIds = rows.map((r) => r.invoice_id);

  const { data: invoices, error: invError } = await supabase
    .from('rent_invoices')
    .select('*')
    .in('id', invoiceIds);

  if (invError) {
    throw new Error(
      invError.message || 'Unable to load invoice details.'
    );
  }

  const invoiceById = new Map(
    ((invoices ?? []) as RentInvoice[]).map((inv) => [inv.id, inv])
  );

  return rows
    .map((submission) => {
      const invoice = invoiceById.get(submission.invoice_id);
      if (!invoice) return null;
      return { ...submission, invoice };
    })
    .filter((row): row is PendingConfirmation => row !== null);
}

/* ============================================================
 * CONFIRM / REJECT
 * ============================================================ */

export async function confirmRentPayment(
  submissionId: string
): Promise<void> {
  const { error } = await supabase.rpc('confirm_rent_payment', {
    p_submission_id: submissionId,
  });

  if (error) {
    throw new Error(
      error.message || 'Unable to confirm the payment.'
    );
  }
}

export async function rejectRentPayment(
  submissionId: string,
  reason: string
): Promise<void> {
  const { error } = await supabase.rpc('reject_rent_payment', {
    p_submission_id: submissionId,
    p_reason: reason,
  });

  if (error) {
    throw new Error(
      error.message || 'Unable to reject the payment.'
    );
  }
}