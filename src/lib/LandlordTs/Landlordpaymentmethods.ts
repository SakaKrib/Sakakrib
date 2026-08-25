import { supabase } from '../supabase';

/* ============================================================
 * TYPES
 *
 * Matches get_my_landlord_payment_methods()'s row shape, and
 * landlord_payment_methods' CHECK constraints, exactly — verified
 * live. Note: M-Pesa only supports PAYBILL or TILL sub-methods —
 * there is no separate "phone number" direct-send option in the
 * schema (landlord_payment_methods_mpesa_method_check only allows
 * PAYBILL/TILL). Do not add a phone-only option without a migration.
 * ============================================================ */

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

// Discriminated union matching landlord_payment_methods_provider_fields_chk
// exactly — the three, and only three, valid shapes the DB will accept.
export type NewPaymentMethodInput =
  | {
      provider: 'PAYPAL';
      display_name?: string | null;
      paypal_email: string;
    }
  | {
      provider: 'MPESA';
      mpesa_method: 'PAYBILL';
      display_name?: string | null;
      paybill_number: string;
      paybill_account: string;
    }
  | {
      provider: 'MPESA';
      mpesa_method: 'TILL';
      display_name?: string | null;
      till_number: string;
    };

/* ============================================================
 * READ
 * ============================================================ */

export async function getMyLandlordPaymentMethods(): Promise<
  LandlordPaymentMethod[]
> {
  const { data, error } = await supabase.rpc(
    'get_my_landlord_payment_methods'
  );

  if (error) {
    throw new Error(
      error.message || 'Unable to load payment methods.'
    );
  }

  return (data ?? []) as LandlordPaymentMethod[];
}

/* ============================================================
 * CREATE / UPDATE / DELETE
 *
 * No RPC wraps these — RLS already permits direct INSERT/UPDATE/
 * DELETE on landlord_payment_methods scoped to the caller's own
 * rows (landlord_id = auth.uid()), verified live. Using the
 * existing, already-authorized data layer rather than inventing
 * an RPC that doesn't exist.
 * ============================================================ */

export async function createLandlordPaymentMethod(
  input: NewPaymentMethodInput
): Promise<LandlordPaymentMethod> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Not authenticated.');
  }

  const row =
    input.provider === 'PAYPAL'
      ? {
          landlord_id: user.id,
          provider: 'PAYPAL' as const,
          display_name: input.display_name ?? null,
          paypal_email: input.paypal_email,
          mpesa_method: null,
          paybill_number: null,
          paybill_account: null,
          till_number: null,
        }
      : input.mpesa_method === 'PAYBILL'
        ? {
            landlord_id: user.id,
            provider: 'MPESA' as const,
            mpesa_method: 'PAYBILL' as const,
            display_name: input.display_name ?? null,
            paybill_number: input.paybill_number,
            paybill_account: input.paybill_account,
            till_number: null,
            paypal_email: null,
          }
        : {
            landlord_id: user.id,
            provider: 'MPESA' as const,
            mpesa_method: 'TILL' as const,
            display_name: input.display_name ?? null,
            till_number: input.till_number,
            paybill_number: null,
            paybill_account: null,
            paypal_email: null,
          };

  const { data, error } = await supabase
    .from('landlord_payment_methods')
    .insert(row)
    .select()
    .single();

  if (error) {
    throw new Error(
      error.message || 'Unable to add payment method.'
    );
  }

  return data as LandlordPaymentMethod;
}

export async function deleteLandlordPaymentMethod(
  id: string
): Promise<void> {
  const { error } = await supabase
    .from('landlord_payment_methods')
    .delete()
    .eq('id', id);

  if (error) {
    throw new Error(
      error.message || 'Unable to delete payment method.'
    );
  }
}

export async function setLandlordPaymentMethodDefault(
  id: string
): Promise<void> {
  const { error } = await supabase.rpc(
    'set_landlord_payment_method_default',
    { p_payment_method_id: id }
  );

  if (error) {
    throw new Error(
      error.message || 'Unable to set default payment method.'
    );
  }
}