import { supabase } from '@/lib/supabase';

/* ============================================================
 * TYPES
 *
 * Matches the live user_notifications table exactly (verified
 * against project zrhvapntshgmhynqtbma). RLS: select/update
 * permitted only where user_id = auth.uid() - no RPC wrapper
 * needed, same pattern as landlord_payment_methods.
 *
 * Real rows land here today via on_subscription_payment_success_
 * notifications, a trigger on subscription_invoices that fires for
 * BOTH landlord_subscription_id and real_estate_subscription_id
 * invoices (verified: queue_subscription_payment_notifications
 * branches on whichever FK is set). This is a genuinely populated
 * table, not an empty placeholder.
 * ============================================================ */

export interface UserNotification {
  id: string;
  notification_type: string;
  title: string;
  message: string;
  data: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
}

export async function getMyNotifications(
  limit = 20
): Promise<UserNotification[]> {
  const { data, error } = await supabase
    .from('user_notifications')
    .select('id, notification_type, title, message, data, read_at, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message || 'Unable to load notifications.');
  }

  return (data ?? []) as UserNotification[];
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase
    .from('user_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .is('read_at', null);

  if (error) {
    throw new Error(error.message || 'Unable to update notification.');
  }
}