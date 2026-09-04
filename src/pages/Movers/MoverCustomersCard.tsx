import { ArrowRight, MapPin, Phone, Users } from 'lucide-react';
import type { MoverBooking } from '@/lib/Movers/moverApi';

interface CustomerSummary {
  renterId: string;
  booking: MoverBooking;
}

interface Props {
  bookings: MoverBooking[];
  onOpenBooking: (bookingId: string) => void;
}

const displayName = (booking: MoverBooking) => {
  const value = (booking as MoverBooking & { renter_name?: string | null; renter_full_name?: string | null }).renter_full_name
    ?? (booking as MoverBooking & { renter_name?: string | null }).renter_name;
  return value?.trim() || 'Renter';
};

const phone = (booking: MoverBooking) => (booking as MoverBooking & { renter_phone?: string | null }).renter_phone?.trim() || null;
const location = (booking: MoverBooking) => {
  const city = (booking as MoverBooking & { renter_city?: string | null }).renter_city?.trim();
  const county = (booking as MoverBooking & { renter_county?: string | null }).renter_county?.trim();
  return [city, county].filter(Boolean).join(', ') || null;
};

export default function MoverCustomersCard({ bookings, onOpenBooking }: Props) {
  const customers = new Map<string, CustomerSummary>();
  [...bookings]
    .filter((booking) => Boolean(booking.renter_id))
    .sort((a, b) => new Date(b.updated_at ?? b.created_at ?? 0).getTime() - new Date(a.updated_at ?? a.created_at ?? 0).getTime())
    .forEach((booking) => {
      if (!customers.has(booking.renter_id)) customers.set(booking.renter_id, { renterId: booking.renter_id, booking });
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
          {recent.map(({ renterId, booking }) => {
            const name = displayName(booking);
            const renterPhone = phone(booking);
            const renterLocation = location(booking);
            return (
              <button key={renterId} type="button" onClick={() => onOpenBooking(booking.id)} className="flex w-full items-center gap-3 p-4 text-left hover:bg-gray-50 dark:hover:bg-brand-900/30">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-700 dark:bg-brand-800/50 dark:text-brand-300">
                  {name.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-gray-900 dark:text-white">{name}</p>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                    {renterPhone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{renterPhone}</span>}
                    {renterLocation && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{renterLocation}</span>}
                    {!renterPhone && !renterLocation && <span>{renterId}</span>}
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-gray-400" />
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
