import { ArrowRight, Clock3, MapPin, User } from 'lucide-react';
import type { MoverBooking } from '@/lib/Movers/moverApi';
import { formatKES } from '@/lib/utils';

interface Props {
  bookings: MoverBooking[];
  onOpen: (bookingId: string) => void;
}

const normalized = (value: string | null | undefined) => value?.trim().toLowerCase().replace(/-/g, '_') ?? '';

const formatDate = (value: string | null) => {
  if (!value) return 'Date not set';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date not set' : date.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
};

export default function MoverBookingRequests({ bookings, onOpen }: Props) {
  const requests = bookings
    .filter((booking) => normalized(booking.status) === 'pending')
    .sort((a, b) => new Date(b.requested_at ?? b.created_at ?? 0).getTime() - new Date(a.requested_at ?? a.created_at ?? 0).getTime())
    .slice(0, 5);

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 p-5 dark:border-brand-800">
        <div>
          <h2 className="font-bold text-gray-900 dark:text-white">Booking requests</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Requests waiting for your response.</p>
        </div>
        <Clock3 className="h-5 w-5 text-warning-600 dark:text-warning-400" />
      </div>

      {requests.length === 0 ? (
        <div className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">No pending mover requests.</div>
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-brand-800">
          {requests.map((booking) => (
            <button
              key={booking.id}
              type="button"
              onClick={() => onOpen(booking.id)}
              className="block w-full p-5 text-left transition-colors hover:bg-gray-50 dark:hover:bg-brand-900/30"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-800/50">
                  <User className="h-5 w-5 text-brand-600 dark:text-brand-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-gray-900 dark:text-white">Renter request</p>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">{formatKES(Number(booking.total_amount ?? 0))}</span>
                  </div>
                  <div className="mt-2 grid gap-1 text-sm text-gray-600 dark:text-gray-400">
                    <p className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0" />{booking.pickup_address} → {booking.dropoff_address}</p>
                    <p>{formatDate(booking.moving_date)}{booking.distance_km != null ? ` · ${booking.distance_km.toFixed(1)} km` : ''}</p>
                  </div>
                </div>
                <ArrowRight className="mt-1 h-5 w-5 shrink-0 text-gray-400" />
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
