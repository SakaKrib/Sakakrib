import { protectedGet, protectedPatch } from '@/lib/djangoApi';

export interface UserNotification {
  id: string;
  notification_type: string;
  title: string;
  message: string;
  data: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
}

export async function getMyNotifications(limit = 20): Promise<UserNotification[]> {
  const safeLimit = Number.isFinite(limit)
    ? Math.max(1, Math.min(100, Math.floor(limit)))
    : 20;

  const response = await protectedGet<{ notifications: UserNotification[] }>(
    `/api/core/notifications/?limit=${safeLimit}`,
  );

  return Array.isArray(response?.notifications)
    ? response.notifications
    : [];
}

export async function markNotificationRead(id: string): Promise<void> {
  if (!id) {
    throw new Error('Notification ID is required.');
  }

  await protectedPatch('/api/core/notifications/', { id });
}
