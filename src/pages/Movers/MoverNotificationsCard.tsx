import { Bell, Check, Clock3 } from 'lucide-react';
import type { MoverNotification } from '@/lib/Movers/moverApi';

interface Props {
  notifications: MoverNotification[];
  onRead: (notificationId: string) => void;
  onOpen: (notification: MoverNotification) => void;
}

function timeAgo(value: string | null | undefined) {
  if (!value) return '';
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}

export default function MoverNotificationsCard({ notifications, onRead, onOpen }: Props) {
  const recent = notifications.slice(0, 5);

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-gray-100 p-5 dark:border-brand-800">
        <div>
          <h2 className="font-bold text-gray-900 dark:text-white">Notifications</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Booking and service updates.</p>
        </div>
        <Bell className="h-5 w-5 text-brand-600 dark:text-brand-400" />
      </div>
      {recent.length === 0 ? (
        <div className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">No notifications.</div>
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-brand-800">
          {recent.map((notification) => (
            <div key={notification.id} className="flex gap-3 p-4">
              <button type="button" onClick={() => onOpen(notification)} className="min-w-0 flex-1 text-left">
                <p className="font-semibold text-gray-900 dark:text-white">{notification.title}</p>
                <p className="mt-1 line-clamp-2 text-sm text-gray-600 dark:text-gray-400">{notification.message}</p>
                {notification.created_at && (
                  <p className="mt-2 flex items-center gap-1.5 text-[10px] text-gray-400 dark:text-gray-500" title={new Date(notification.created_at).toLocaleString('en-KE')}>
                    <Clock3 className="h-3 w-3" />
                    <span>{timeAgo(notification.created_at)}</span>
                  </p>
                )}
              </button>
              {!notification.read_at && (
                <button type="button" onClick={() => onRead(notification.id)} aria-label="Mark notification as read" className="rounded-lg p-2 text-brand-600 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-900/30">
                  <Check className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
