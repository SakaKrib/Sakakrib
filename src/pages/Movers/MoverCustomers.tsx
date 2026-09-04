import { RefreshCw, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import { moverApi, type MoverCustomer } from '@/lib/Movers';

export default function MoverCustomers() {
  const { profile } = useAuth();
  const { navigate } = useNav();
  const [customers, setCustomers] = useState<MoverCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile?.id || profile.role !== 'mover') { setLoading(false); return; }
    setLoading(true); setError(null);
    try { setCustomers(await moverApi.getCustomers()); }
    catch (err) { console.error('Failed to load mover customers:', err); setError(err instanceof Error ? err.message : 'Unable to load customers.'); }
    finally { setLoading(false); }
  }, [profile?.id, profile?.role]);

  useEffect(() => { void load(); }, [load]);

  const bookingCount = useMemo(() => customers.reduce((total, customer) => total + customer.booking_count, 0), [customers]);
  const activeCount = useMemo(() => customers.reduce((total, customer) => total + customer.active_booking_count, 0), [customers]);

  if (loading) return <div className="flex min-h-[400px] items-center justify-center"><RefreshCw className="h-7 w-7 animate-spin text-brand-500" /></div>;

  return (
    <div className="mx-auto max-w-7xl px-2 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <button type="button" onClick={() => navigate('dashboard')} className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">← Back to dashboard</button>
          <h1 className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">Customers</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Verified renter information and booking history from your mover relationships.</p>
        </div>
        <button type="button" onClick={() => void load()} className="btn-secondary inline-flex items-center gap-2 text-sm"><RefreshCw className="h-4 w-4" />Refresh</button>
      </div>

      {error && <div className="mb-5 rounded-xl border border-error-200 bg-error-50 p-4 text-sm text-error-700">{error}</div>}

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <div className="card p-4"><div className="flex items-center gap-3"><Users className="h-5 w-5 text-brand-600 dark:text-brand-400" /><div><p className="text-xs text-gray-500 dark:text-gray-400">Unique customers</p><p className="text-xl font-bold text-gray-900 dark:text-white">{customers.length}</p></div></div></div>
        <div className="card p-4"><p className="text-xs text-gray-500 dark:text-gray-400">Total bookings</p><p className="mt-1 text-xl font-bold text-gray-900 dark:text-white">{bookingCount}</p></div>
        <div className="card p-4"><p className="text-xs text-gray-500 dark:text-gray-400">Active bookings</p><p className="mt-1 text-xl font-bold text-gray-900 dark:text-white">{activeCount}</p></div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {customers.length === 0 ? (
          <div className="card p-10 text-center lg:col-span-2"><Users className="mx-auto h-10 w-10 text-brand-500" /><h2 className="mt-3 font-bold text-gray-900 dark:text-white">No customers yet</h2><p className="mx-auto mt-1 max-w-md text-sm text-gray-500 dark:text-gray-400">Customers will appear here after you receive mover bookings.</p></div>
        ) : customers.map(customer => (
          <section key={customer.id} className="card overflow-hidden">
            <div className="flex items-start gap-3 border-b border-gray-100 p-5 dark:border-brand-800">
              {customer.profile_photo_url ? <img src={customer.profile_photo_url} alt="" className="h-12 w-12 rounded-full object-cover" /> : <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-700 dark:bg-brand-800/50 dark:text-brand-300">{(customer.full_name || 'Renter').slice(0, 2).toUpperCase()}</div>}
              <div className="min-w-0 flex-1"><h2 className="truncate font-bold text-gray-900 dark:text-white">{customer.full_name?.trim() || 'Renter'}</h2><p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{[customer.city, customer.county].filter(Boolean).join(', ') || 'Location not provided'}</p></div>
              <button type="button" onClick={() => navigate('mover-booking-detail', customer.last_booking_id ?? undefined)} disabled={!customer.last_booking_id} className="btn-secondary inline-flex items-center gap-1 text-xs disabled:opacity-50">Open booking</button>
            </div>
            <div className="grid gap-2 p-5 text-sm sm:grid-cols-2">
              <div><span className="text-xs text-gray-500 dark:text-gray-400">Phone</span><p className="font-medium text-gray-900 dark:text-white">{customer.phone || (customer.contact_released ? 'Not provided' : 'Available after contact release')}</p></div>
              <div><span className="text-xs text-gray-500 dark:text-gray-400">Email</span><p className="truncate font-medium text-gray-900 dark:text-white">{customer.email || (customer.contact_released ? 'Not provided' : 'Available after contact release')}</p></div>
              <div><span className="text-xs text-gray-500 dark:text-gray-400">Bookings</span><p className="font-medium text-gray-900 dark:text-white">{customer.booking_count}</p></div>
              <div><span className="text-xs text-gray-500 dark:text-gray-400">Active / completed</span><p className="font-medium text-gray-900 dark:text-white">{customer.active_booking_count} / {customer.completed_booking_count}</p></div>
              <div><span className="text-xs text-gray-500 dark:text-gray-400">Contact access</span><p className="font-medium text-gray-900 dark:text-white">{customer.contact_released ? 'Released' : 'Restricted'}</p></div>
            </div>
            <div className="border-t border-gray-100 p-5 dark:border-brand-800">
              <p className="mb-3 text-sm font-bold text-gray-900 dark:text-white">Recent bookings</p>
              <div className="space-y-2">{customer.bookings.slice(0, 5).map(booking => <button key={booking.id} type="button" onClick={() => navigate('mover-booking-detail', booking.id)} className="flex w-full items-center justify-between gap-3 rounded-lg bg-gray-50 p-3 text-left hover:bg-gray-100 dark:bg-brand-900/30 dark:hover:bg-brand-900/50"><div className="min-w-0"><p className="truncate text-xs font-semibold text-gray-900 dark:text-white">{booking.pickup_address} → {booking.dropoff_address}</p><p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">{booking.moving_date || 'Date not set'} · {booking.status || 'Unknown status'}</p></div><span className="shrink-0 text-xs font-semibold text-brand-600 dark:text-brand-400">View</span></button>)}</div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
