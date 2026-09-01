import { protectedGet, protectedPost } from '@/lib/djangoApi';

export interface CreatedInvitation {
  id: string;
  unit_id: string;
  renter_name: string;
  renter_phone: string | null;
  renter_email: string;
  rent_amount: number | string;
  status: 'PENDING';
  invited_at: string;
  invite_expires_at: string;
  invite_token: string;
}

export interface InvitationPreview {
  renter_name: string;
  unit_number: string;
  unit_type: string;
  rent_amount: number | string;
  property_title: string;
  property_city: string;
  invitation_status: 'PENDING' | 'ACTIVE' | 'INACTIVE' | 'ENDED' | 'EXPIRED';
}

export async function createRenterInvitation(
  unitId: string,
  renterName: string,
  renterPhone: string | null,
  renterEmail: string
): Promise<CreatedInvitation> {
  return protectedPost<CreatedInvitation>('/api/core/renter-invitations/', {
    unit_id: unitId,
    renter_name: renterName,
    renter_phone: renterPhone,
    renter_email: renterEmail,
    app_base_url: window.location.origin,
  });
}

export async function resendRenterInvitation(
  associationId: string
): Promise<{ invite_token: string; invite_expires_at: string }> {
  return protectedPost<{ invite_token: string; invite_expires_at: string }>(
    `/api/core/renter-invitations/${encodeURIComponent(associationId)}/resend/`,
    { app_base_url: window.location.origin },
  );
}

export async function cancelRenterInvitation(
  associationId: string
): Promise<void> {
  await protectedPost(
    `/api/core/renter-invitations/${encodeURIComponent(associationId)}/cancel/`,
    {},
  );
}

export async function getInvitationPreview(
  token: string
): Promise<InvitationPreview | null> {
  if (!token) throw new Error('Invitation token is required.');
  return protectedGet<InvitationPreview>(
    `/api/core/renter-invitations/${encodeURIComponent(token)}/preview/`,
  );
}

export async function claimInvitation(token: string): Promise<void> {
  if (!token) throw new Error('Invitation token is required.');
  await protectedPost(
    `/api/core/renter-invitations/${encodeURIComponent(token)}/claim/`,
    {},
  );
}

export interface PaymentReminderResult {
  in_app_sent: boolean;
  email_sent: boolean;
  whatsapp_sent: boolean;
}

export async function sendPaymentReminder(
  renterAssocId: string,
  message?: string
): Promise<PaymentReminderResult> {
  return protectedPost<PaymentReminderResult>(
    `/api/core/rent-reminders/${encodeURIComponent(renterAssocId)}/send/`,
    { message: message ?? null },
  );
}

function buildClaimUrl(token: string): string {
  return `${window.location.origin}/#claim-rental/${token}`;
}

export { buildClaimUrl };
