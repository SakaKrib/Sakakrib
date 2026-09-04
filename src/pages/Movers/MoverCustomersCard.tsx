import { ArrowRight, MapPin, Phone, Users } from 'lucide-react';
import type { MoverCustomer } from '@/lib/Movers/moverApi';

interface Props {
  customers: MoverCustomer[];
  onOpenBooking: (bookingId: string) => void;
}

export default function MoverCustomersCard({ customers, onOpenBooking }: Props) {
  const recent = customers.slice(0, 5);

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-gray-100 p-5 dark:border-brand-800">
        <div><h2 className="font-bold text-gray-900 dark:text-white">Customers</h2><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Verified renter relationships from your bookings.</p></div>
        <Users className="h-5 w-5 text-brand-600 dark:text-brand-400" />
      </div>
      {recent.length === 0 ? (
        <div className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">No customers yet.</div>
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-brand-800">
          {recent.map(customer => {
            const name = customer.full_name?.trim() || 'Renter';
            const location = [customer.city, customer.county].filter(Boolean).join(', ');
            return <button key={customer.id} type="button" onClick={() => customer.last_booking_id && onOpenBooking(customer.last_booking_id)} disabled={!customer.last_booking_id} className="flex w-full items-center gap-3 p-4 text-left hover:bg-gray-50 disabled:cursor-default dark:hover:bg-brand-900/30">
              {customer.profile_photo_url ? <img src={customer.profile_photo_url} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" /> : <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-700 dark:bg-brand-800/50 dark:text-brand-300">{name.slice(0, 2).toUpperCase()}</div>}
              <div className="min-w-0 flex-1"><p className="truncate font-semibold text-gray-900 dark:text-white">{name}</p><div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">{customer.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{customer.phone}</span>}{location && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{location}</span>}<span>{customer.booking_count} booking{customer.booking_count === 1 ? '' : 's'}</span>{!customer.phone && !location && <span>{customer.contact_released ? 'Contact details unavailable' : 'Contact restricted'}</span>}</div></div>
              <ArrowRight className="h-4 w-4 shrink-0 text-gray-400" />
            </button>;
          })}
        </div>
      )}
    </section>
  );
}
