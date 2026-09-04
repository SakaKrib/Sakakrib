import { CalendarDays, Clock3 } from 'lucide-react';
import type { MoverBooking, MoverScheduleEvent } from '@/lib/Movers/moverApi';

interface Props {
  bookings: MoverBooking[];
  schedule: MoverScheduleEvent[];
  onOpen: (bookingId: string) => void;
}

const upcoming = (value: string | null) => {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time >= Date.now();
};

const formatDateTime = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Invalid schedule' : date.toLocaleString('en-KE', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
};

export default function MoverScheduleOverview({ bookings, schedule, onOpen }: Props) {
  const events = schedule
    .filter((event) => ['TENTATIVE', 'CONFIRMED'].includes(event.status) && upcoming(event.starts_at))
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
    .slice(0, 5);

  const bookingById = new Map(bookings.map((booking) => [booking.id, booking]));

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-gray-100 p-5 dark:border-brand-800">
        <div>
          <h2 className="font-bold text-gray-900 dark:text-white">Upcoming jobs</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Your confirmed and tentative moving schedule.</p>
        </div>
        <CalendarDays className="h-5 w-5 text-brand-600 dark:text-brand-400" />
      </div>
      {events.length === 0 ? (
        <div className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">No upcoming jobs are scheduled.</div>
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-brand-800">
          {events.map((event) => {
            const booking = bookingById.get(event.booking_id);
            return (
              <button key={event.id} type="button" onClick={() => onOpen(event.booking_id)} className="flex w-full items-start gap-4 p-5 text-left hover:bg-gray-50 dark:hover:bg-brand-900/30">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-800/50">
                  <Clock3 className="h-5 w-5 text-brand-600 dark:text-brand-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-gray-900 dark:text-white">{event.title || 'Moving service'}</p>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{formatDateTime(event.starts_at)} – {new Date(event.ends_at).toLocaleTimeString('en-KE', { hour: 'numeric', minute: '2-digit' })}</p>
                  {booking && <p className="mt-1 truncate text-sm text-gray-500 dark:text-gray-500">{booking.pickup_address} → {booking.dropoff_address}</p>}
                  <span className="mt-2 inline-flex rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700 dark:bg-brand-800 dark:text-gray-300">{event.status}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
