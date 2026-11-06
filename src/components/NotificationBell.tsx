import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck, Loader2 } from 'lucide-react';

import { getMyNotifications, markNotificationRead, type UserNotification } from '@/lib/RealEstateTs/Usernotifications';

function timeAgo(value: string): string {
  const diff = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days < 7 ? `${days}d ago` : new Date(value).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' });
}

/** Header bell: unread badge plus a dropdown of the latest notifications. */
export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<UserNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      setItems(await getMyNotifications(30));
      setError(false);
    } catch {
      if (!silent) setError(true);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const refresh = () => { if (document.visibilityState === 'visible') void load(true); };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener('sakakrib:push', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('sakakrib:push', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | TouchEvent) => { if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('touchstart', close); };
  }, [open]);

  const unread = items.filter((item) => !item.read_at).length;
  const markRead = async (item: UserNotification) => {
    if (item.read_at) return;
    setItems((current) => current.map((row) => row.id === item.id ? { ...row, read_at: new Date().toISOString() } : row));
    try { await markNotificationRead(item.id); } catch { void load(true); }
  };
  const markAll = async () => {
    const pending = items.filter((item) => !item.read_at);
    setItems((current) => current.map((row) => ({ ...row, read_at: row.read_at ?? new Date().toISOString() })));
    await Promise.all(pending.map((item) => markNotificationRead(item.id).catch(() => undefined)));
  };

  return (
    <div ref={rootRef} className="relative">
      <button type="button" onClick={() => { setOpen((value) => !value); if (!open) void load(true); }} className="relative rounded-full border border-gray-300 p-2 text-gray-600 hover:border-btnblue-400 hover:text-btnblue-600 dark:border-brand-700 dark:text-gray-300" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} aria-expanded={open}>
        <Bell className="h-5 w-5" />
        {unread > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-error-600 px-1 text-[10px] font-bold text-white">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="fixed inset-x-3 top-[4.25rem] z-50 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-brand-700 dark:bg-brand-900 sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-96">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-brand-800">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">Notifications</h3>
            {unread > 0 && <button type="button" onClick={() => void markAll()} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 dark:text-brand-300"><CheckCheck className="h-3.5 w-3.5" />Mark all read</button>}
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {loading ? <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" />Loading...</div>
              : error ? <p className="p-6 text-center text-sm text-error-600">Unable to load notifications.</p>
              : items.length === 0 ? <div className="px-6 py-10 text-center text-sm text-gray-500 dark:text-gray-400"><Bell className="mx-auto mb-2 h-6 w-6 text-gray-300" />You're all caught up.</div>
              : items.map((item) => (
                <button key={item.id} type="button" onClick={() => void markRead(item)} className={`flex w-full gap-3 border-b border-gray-50 px-4 py-3 text-left last:border-0 hover:bg-gray-50 dark:border-brand-800 dark:hover:bg-brand-800/50 ${item.read_at ? '' : 'bg-brand-50/60 dark:bg-brand-800/30'}`}>
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.read_at ? 'bg-transparent' : 'bg-brand-600'}`} />
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-gray-900 dark:text-white">{item.title}</span><span className="mt-0.5 line-clamp-2 block text-xs leading-5 text-gray-600 dark:text-gray-300">{item.message}</span><span className="mt-1 block text-[11px] text-gray-400">{timeAgo(item.created_at)}</span></span>
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
