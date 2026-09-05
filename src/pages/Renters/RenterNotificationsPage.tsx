import { useCallback, useEffect, useState } from 'react';
import { Bell, CheckCircle2, MessageCircle, RefreshCw, Truck } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import { protectedGet, protectedPatch } from '@/lib/djangoApi';
import { renterApi, type Booking } from '@/lib/Renter/renterApi';

type Notification = { id: string; title: string; message: string; data?: Record<string, unknown> | null; action_payload?: Record<string, unknown> | null; read_at?: string | null; created_at: string };
const time = (value: string) => new Date(value).toLocaleString('en-KE', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export default function RenterNotificationsPage() {
  const { profile } = useAuth();
  const { navigate } = useNav();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile?.id || profile.role !== 'renter') { setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const response = await protectedGet<{ notifications?: Notification[] }>('/api/core/notifications/?limit=100');
      setNotifications(Array.isArray(response?.notifications) ? response.notifications : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load notifications.');
    } finally { setLoading(false); }
  }, [profile?.id, profile?.role]);

  useEffect(() => { void load(); }, [load]);

  const openNotification = async (notification: Notification) => {
    if (!notification.read_at) {
      try { await protectedPatch('/api/core/notifications/', { id: notification.id }); } catch { /* navigation remains useful if read marking fails */ }
      setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, read_at: new Date().toISOString() } : item));
    }
    const payload = notification.data ?? notification.action_payload ?? {};
    const bookingId = typeof payload.booking_id === 'string' ? payload.booking_id : null;
    const moverId = typeof payload.mover_id === 'string' ? payload.mover_id : null;
    if (moverId) { navigate('chat', moverId); return; }
    if (bookingId) {
      try {
        const booking: Booking = await renterApi.getBooking(bookingId);
        if (booking.mover_id) { navigate('chat', booking.mover_id); return; }
      } catch { /* fall through to notification list */ }
    }
  };

  if (loading) return <div className="flex min-h-[420px] items-center justify-center"><RefreshCw className="h-7 w-7 animate-spin text-brand-500" /></div>;
  const unread = notifications.filter((item) => !item.read_at).length;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div><button type="button" onClick={() => navigate('dashboard')} className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">← Back to dashboard</button><h1 className="mt-2 flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white"><Bell className="h-6 w-6 text-brand-500" />Notifications</h1><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Booking, moving and account updates from Django.</p></div>
        <button type="button" onClick={() => void load()} className="btn-secondary inline-flex items-center gap-2 text-sm"><RefreshCw className="h-4 w-4" />Refresh</button>
      </div>
      {error && <div className="mb-5 rounded-xl bg-error-50 p-4 text-sm text-error-700 dark:bg-error-900/20 dark:text-error-400">{error}</div>}
      <div className="mb-4 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400"><CheckCircle2 className="h-4 w-4" />{unread} unread notification{unread === 1 ? '' : 's'}</div>
      <div className="card overflow-hidden">
        {notifications.length === 0 ? <div className="p-12 text-center"><Bell className="mx-auto h-10 w-10 text-gray-400" /><p className="mt-4 font-semibold text-gray-900 dark:text-white">No notifications</p><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">New booking and account updates will appear here.</p></div> : <div className="divide-y divide-gray-100 dark:divide-brand-800">{notifications.map((notification) => <button key={notification.id} type="button" onClick={() => void openNotification(notification)} className={`flex w-full items-start gap-4 p-5 text-left transition hover:bg-gray-50 dark:hover:bg-brand-900/30 ${!notification.read_at ? 'bg-brand-50/40 dark:bg-brand-900/20' : ''}`}><span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-900/50 dark:text-brand-300"><MessageCircle className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="flex items-center gap-2"><span className="font-semibold text-gray-900 dark:text-white">{notification.title}</span>{!notification.read_at && <span className="h-2 w-2 rounded-full bg-error-500" />}</span><span className="mt-1 block text-sm text-gray-600 dark:text-gray-300">{notification.message}</span><span className="mt-2 block text-xs text-gray-400">{time(notification.created_at)}</span></span></button>)}</div>}
      </div>
    </div>
  );
}
