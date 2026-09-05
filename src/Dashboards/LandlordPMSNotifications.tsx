import { useEffect, useState } from 'react';
import { Bell, CheckCircle2, Clock3, RefreshCw } from 'lucide-react';
import { protectedGet, protectedPost } from '@/lib/djangoApi';

type Notification = Record<string, any>;

const formatDate = (value: unknown) => value
  ? new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(String(value)))
  : '—';

export default function LandlordPMSNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await protectedGet<Notification>('/api/core/pms/dashboard/');
      setNotifications(Array.isArray(data?.notifications) ? data.notifications : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load notifications.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const markRead = async (notification: Notification) => {
    setBusy(String(notification.id));
    setError(null);
    try {
      await protectedPost('/api/core/pms/action/', {
        action: notification.source === 'PMS' ? 'mark_pms_notification_read' : 'mark_user_notification_read',
        notification_id: notification.id,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update notification.');
    } finally {
      setBusy(null);
    }
  };

  const unread = notifications.filter((item) => !item.read).length;

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-4 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-brand-800 dark:bg-brand-950 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-600">PMS notifications</p>
          <h2 className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">Keep every landlord action visible</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Notifications are read from and acknowledged through Django.</p>
        </div>
        <button type="button" onClick={() => void load()} className="btn-secondary inline-flex items-center justify-center gap-2"><RefreshCw className="h-4 w-4" />Refresh</button>
      </div>

      {error && <div className="rounded-xl bg-error-50 px-4 py-3 text-sm text-error-700 dark:bg-error-900/20 dark:text-error-300">{error}</div>}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-800 dark:bg-brand-950"><Bell className="h-5 w-5 text-brand-600" /><p className="mt-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Total</p><p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{notifications.length}</p></div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-800 dark:bg-brand-950"><Clock3 className="h-5 w-5 text-warning-600" /><p className="mt-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Unread</p><p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{unread}</p></div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-800 dark:bg-brand-950"><CheckCircle2 className="h-5 w-5 text-success-600" /><p className="mt-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Read</p><p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{notifications.length - unread}</p></div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-brand-800 dark:bg-brand-950">
        {loading ? (
          <div className="flex min-h-60 items-center justify-center"><RefreshCw className="h-7 w-7 animate-spin text-brand-600" /></div>
        ) : notifications.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-500">You have no PMS notifications.</div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-brand-800">
            {notifications.map((notification) => (
              <div key={`${notification.source || 'notification'}-${notification.id}`} className={`p-5 ${notification.read ? '' : 'bg-brand-50/50 dark:bg-brand-900/20'}`}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-gray-900 dark:text-white">{notification.title || 'PMS notification'}</h3>
                      {!notification.read && <span className="rounded-full bg-brand-600 px-2 py-1 text-[10px] font-bold text-white">NEW</span>}
                    </div>
                    <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">{notification.message || notification.body || 'No additional details.'}</p>
                    <p className="mt-2 text-xs text-gray-400">{formatDate(notification.created_at)}</p>
                  </div>
                  {!notification.read && <button type="button" disabled={busy === String(notification.id)} onClick={() => void markRead(notification)} className="btn-secondary shrink-0 px-3 py-2 text-xs">{busy === String(notification.id) ? 'Saving…' : 'Mark as read'}</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
