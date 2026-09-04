import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, MessageCircle, RefreshCw } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import { moverApi, type MoverBooking } from '@/lib/Movers';

export default function MoverMessages() {
  const { profile } = useAuth();
  const { navigate } = useNav();
  const [bookings, setBookings] = useState<MoverBooking[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile?.id || profile.role !== 'mover') { setLoading(false); return; }
    setLoading(true);
    try { setBookings(await moverApi.getBookings()); }
    catch (error) { console.error('Failed to load mover conversations:', error); }
    finally { setLoading(false); }
  }, [profile?.id, profile?.role]);

  useEffect(() => { void load(); }, [load]);

  const customers = new Map<string, MoverBooking>();
  [...bookings]
    .filter((booking) => Boolean(booking.renter_id))
    .sort((a, b) => new Date(b.updated_at ?? b.created_at ?? 0).getTime() - new Date(a.updated_at ?? a.created_at ?? 0).getTime())
    .forEach((booking) => { if (!customers.has(booking.renter_id)) customers.set(booking.renter_id, booking); });

  if (loading) return <div className="flex min-h-[400px] items-center justify-center"><RefreshCw className="h-7 w-7 animate-spin text-brand-500" /></div>;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <button type="button" onClick={() => navigate('dashboard')} className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">← Back to dashboard</button>
          <h1 className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">Mover messages</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Open customer conversations from your active and previous bookings.</p>
        </div>
        <button type="button" onClick={() => void load()} className="btn-secondary inline-flex items-center gap-2 text-sm"><RefreshCw className="h-4 w-4" />Refresh</button>
      </div>

      {customers.size === 0 ? (
        <div className="card p-10 text-center"><MessageCircle className="mx-auto h-10 w-10 text-brand-500" /><h2 className="mt-3 font-bold text-gray-900 dark:text-white">No customer conversations yet</h2><p className="mx-auto mt-1 max-w-md text-sm text-gray-500 dark:text-gray-400">Once a renter books your moving service, their booking will appear here.</p></div>
      ) : (
        <div className="card overflow-hidden">
          <div className="border-b border-gray-100 p-5 dark:border-brand-800"><h2 className="font-bold text-gray-900 dark:text-white">Customer conversations</h2><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Select a booking to open the authenticated chat workspace.</p></div>
          <div className="divide-y divide-gray-100 dark:divide-brand-800">
            {[...customers.entries()].map(([renterId, booking]) => (
              <button key={renterId} type="button" onClick={() => navigate('chat', renterId)} className="flex w-full items-center gap-3 p-4 text-left hover:bg-gray-50 dark:hover:bg-brand-900/30">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-700 dark:bg-brand-800/50 dark:text-brand-300">{renterId.slice(0, 2).toUpperCase()}</div>
                <div className="min-w-0 flex-1"><p className="font-semibold text-gray-900 dark:text-white">Customer conversation</p><p className="truncate text-xs text-gray-500 dark:text-gray-400">Booking {booking.id}</p></div>
                <ArrowRight className="h-4 w-4 shrink-0 text-gray-400" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
