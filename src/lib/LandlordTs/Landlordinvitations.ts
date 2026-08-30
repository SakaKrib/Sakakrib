import { supabase } from './Protectedsupabase';

/* ============================================================
 * TYPES — verified against the live migration just applied.
 * ============================================================ */

export interface CreatedInvitation {
  id: string;
  unit_id: string;
  renter_name: string;
  renter_phone: string | null;
  renter_email: string;
  rent_amount: number;
  status: 'PENDING';
  invited_at: string;
  invite_expires_at: string;
  // Returned exactly once, at creation/resend time. Never stored,
  // never retrievable again — only its hash persists server-side.
  // The caller must surface/copy this immediately.
  invite_token: string;
}

export interface InvitationPreview {
  renter_name: string;
  unit_number: string;
  unit_type: string;
  rent_amount: number;
  property_title: string;
  property_city: string;
  invitation_status: 'PENDING' | 'ACTIVE' | 'INACTIVE' | 'ENDED' | 'EXPIRED';
}

/* ============================================================
 * LANDLORD: create / resend
 * ============================================================ */

export async function createRenterInvitation(
  unitId: string,
  renterName: string,
  renterPhone: string | null,
  renterEmail: string
): Promise<CreatedInvitation> {
  const { data, error } = await supabase.rpc('create_renter_invitation', {
    p_unit_id: unitId,
    p_renter_name: renterName,
    p_renter_phone: renterPhone,
    p_renter_email: renterEmail,
    p_app_base_url: window.location.origin,
  });

  if (error) {
    throw new Error(error.message || 'Unable to create invitation.');
  }

  return data as CreatedInvitation;
}

export async function resendRenterInvitation(
  associationId: string
): Promise<{ invite_token: string; invite_expires_at: string }> {
  const { data, error } = await supabase.rpc('resend_renter_invitation', {
    p_association_id: associationId,
    p_app_base_url: window.location.origin,
  });

  if (error) {
    throw new Error(error.message || 'Unable to resend invitation.');
  }

  return data as { invite_token: string; invite_expires_at: string };
}

// Cancel/revoke a still-pending invitation — no dedicated RPC needed;
// landlords already have DELETE via existing RLS on
// renter_unit_associations (verified), scoped to their own rows.
export async function cancelRenterInvitation(
  associationId: string
): Promise<void> {
  const { error } = await supabase
    .from('renter_unit_associations')
    .delete()
    .eq('id', associationId)
    .eq('status', 'PENDING');

  if (error) {
    throw new Error(error.message || 'Unable to cancel invitation.');
  }
}

/* ============================================================
 * RENTER: preview (works while logged out) + claim
 * ============================================================ */

export async function getInvitationPreview(
  token: string
): Promise<InvitationPreview | null> {
  const { data, error } = await supabase.rpc(
    'get_renter_invitation_preview',
    { p_token: token }
  );

  if (error) {
    throw new Error(error.message || 'Unable to load this invitation.');
  }

  const row = Array.isArray(data) ? data[0] : data;
  return (row as InvitationPreview | undefined) ?? null;
}

export async function claimInvitation(token: string): Promise<void> {
  const { error } = await supabase.rpc('claim_renter_invitation', {
    p_token: token,
  });

  if (error) {
    throw new Error(error.message || 'Unable to claim this rental.');
  }
}

/* ============================================================
 * PAYMENT REMINDER
 *
 * Only works for ACTIVE (claimed) associations — the renter must
 * have a renter_user_id to receive the in-app notification. Reports
 * exactly which channels were used; whatsapp_sent is always false
 * until a provider is actually integrated (deliberately not built
 * yet — no WhatsApp infrastructure exists in this project).
 * ============================================================ */

export interface PaymentReminderResult {
  in_app_sent: boolean;
  email_sent: boolean;
  whatsapp_sent: boolean;
}

export async function sendPaymentReminder(
  renterAssocId: string,
  message?: string
): Promise<PaymentReminderResult> {
  const { data, error } = await supabase.rpc('send_payment_reminder', {
    p_renter_assoc_id: renterAssocId,
    p_message: message ?? null,
  });

  if (error) {
    throw new Error(error.message || 'Unable to send reminder.');
  }

  return data as PaymentReminderResult;
}

function buildClaimUrl(token: string): string {
  return `${window.location.origin}/#claim-rental/${token}`;
}

export { buildClaimUrl };