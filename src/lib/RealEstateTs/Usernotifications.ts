import {
  protectedGet,
  protectedPatch,
} from '@/lib/protectedApi';

/* ============================================================
 * TYPES
 *
 * This service uses the application's HttpOnly-cookie transport
 * exclusively. It does not use the browser Supabase Auth session.
 * The protected-api Edge Function carries the authenticated user
 * context to PostgREST, where RLS scopes notifications to the user.
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

interface UserNotificationRow {
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
  const safeLimit = Number.isFinite(limit)
    ? Math.max(1, Math.floor(limit))
    : 20;

  const data = await protectedGet<UserNotificationRow[]>(
    `/rest/v1/user_notifications?select=id,notification_type,title,message,data,read_at,created_at&order=created_at.desc&limit=${safeLimit}`
  );

  return Array.isArray(data)
    ? data.map(
        (notification: UserNotificationRow): UserNotification => ({
          id: notification.id,
          notification_type: notification.notification_type,
          title: notification.title,
          message: notification.message,
          data: notification.data,
          read_at: notification.read_at,
          created_at: notification.created_at,
        })
      )
    : [];
}

export async function markNotificationRead(
  id: string
): Promise<void> {
  if (!id) {
    throw new Error('Notification ID is required.');
  }

  await protectedPatch(
    `/rest/v1/user_notifications?id=eq.${encodeURIComponent(id)}&read_at=is.null`,
    {
      read_at: new Date().toISOString(),
    },
    {
      headers: {
        Prefer: 'return=minimal',
      },
    }
  );
}
