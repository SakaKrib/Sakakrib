import { useCallback, useEffect, useState } from 'react';
import { Bell, CheckCheck, Loader2, RefreshCw } from 'lucide-react';
import { useLiveEvents } from '@/lib/useLiveEvents';

import {
  getMyNotifications,
  markNotificationRead,
  type UserNotification,
} from '@/lib/RealEstateTs/Usernotifications';

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-KE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export default function RealEstatePMSNotifications() {
  const { event: liveEvent } = useLiveEvents(true);
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      setNotifications(await getMyNotifications(100));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load notifications.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (
      (liveEvent?.type === 'ready' && liveEvent.reconnected) ||
      (liveEvent?.type === 'resource.updated' &&
        ['pms', 'notifications', 'subscriptions', 'applications'].includes(liveEvent.resource ?? ''))
    ) void load(true);
  }, [liveEvent, load]);

  const handleRead = async (notification: UserNotification) => {
    if (notification.read_at) return;
    try {
      await markNotificationRead(notification.id);
      setNotifications((current) =>
        current.map((item) =>
          item.id === notification.id
            ? { ...item, read_at: new Date().toISOString() }
            : item,
        ),
      );
    } catch {
      // Read state is non-critical; keep the notification visible.
    }
  };

  const unreadCount = notifications.filter((notification) => !notification.read_at).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-500 dark:text-gray-400">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading notifications...
      </div>
    );
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-brand-600 dark:text-brand-300" />
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Notifications</h2>
            {unreadCount > 0 && (
              <span className="rounded-full bg-brand-100 px-2.5 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-800 dark:text-brand-300">
                {unreadCount} unread
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Subscription, payment, listing, account, and PMS updates.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={refreshing}
          className="inline-flex items-center justify-center gap-2 rounded-xl border bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 dark:border-brand-700 dark:bg-brand-900 dark:text-gray-200"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}

      {!error && notifications.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-10 text-center dark:border-brand-700 dark:bg-brand-900/40">
          <Bell className="mx-auto h-10 w-10 text-gray-400" />
          <p className="mt-3 font-semibold text-gray-700 dark:text-gray-300">No notifications yet</p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            New PMS and account updates will appear here.
          </p>
        </div>
      )}

      {notifications.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-brand-800 dark:bg-brand-950">
          {notifications.map((notification) => (
            <button
              key={notification.id}
              type="button"
              onClick={() => void handleRead(notification)}
              className={`flex w-full items-start gap-3 border-b p-4 text-left last:border-b-0 dark:border-brand-800 ${
                notification.read_at
                  ? 'hover:bg-gray-50 dark:hover:bg-brand-800'
                  : 'bg-brand-50/60 hover:bg-brand-50 dark:bg-brand-800/40 dark:hover:bg-brand-800'
              }`}
            >
              <span className="mt-1.5 flex h-2.5 w-2.5 shrink-0 items-center justify-center">
                {!notification.read_at && <span className="h-2.5 w-2.5 rounded-full bg-brand-600" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-gray-900 dark:text-white">{notification.title}</span>
                  {notification.read_at && <CheckCheck className="h-4 w-4 text-gray-400" />}
                </div>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{notification.message}</p>
                <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">{formatDate(notification.created_at)}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
