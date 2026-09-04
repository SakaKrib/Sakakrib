import { ArrowRight, Users } from 'lucide-react';
import type { MoverBooking } from '@/lib/Movers/moverApi';

interface Props {
  bookings: MoverBooking[];
  onOpenBooking: (bookingId: string) => void;
}

export default function MoverCustomersCard({ bookings, onOpenBooking }: Props) {
  const customers = new Map<string, MoverBooking>();
  [...bookings]
    .sort((a, b) => new Date(b.updated_at ?? b.created_at ?? 0).getTime() - new Date(a.updated_at ?? a.created_at ?? 0).getTime())
    .forEach((booking) => {
      if (!customers.has(booking.renter_id)) customers.set(booking.renter_id, booking);
    });

  const recent = [...customers.values()].slice(0, 5);

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-gray-100 p-5 dark:border-brand-800">
        <div>
          <h2 className="font-bold text-gray-900 dark:text-white">Customers</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Renter relationships from your bookings.</p>
        </div>
        <Users className="h-5 w-5 text-brand-600 dark:text-brand-400" />
      </div>
      {recent.length === 0 ? (
        <div className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">No customers yet.</div>
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-brand-800">
          {recent.map((booking) => (
            <button key={booking.renter_id} type="button" onClick={() => onOpenBooking(booking.id)} className="flex w-full items-center gap-3 p-4 text-left hover:bg-gray-50 dark:hover:bg-brand-900/30">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-700 dark:bg-brand-800/50 dark:text-brand-300">
                {booking.renter_id.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-gray-900 dark:text-white">Renter</p>
                <p className="truncate text-xs text-gray-500 dark:text-gray-400">{booking.renter_id}</p>
              </div>
              <ArrowRight className="h-4 w-4 text-gray-400" />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
