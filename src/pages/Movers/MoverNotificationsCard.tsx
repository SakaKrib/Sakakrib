import { Bell, Check } from 'lucide-react';
import type { MoverNotification } from '@/lib/Movers/moverApi';

interface Props {
  notifications: MoverNotification[];
  onRead: (notificationId: string) => void;
  onOpen: (notification: MoverNotification) => void;
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
