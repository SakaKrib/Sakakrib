import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import { renterApi, type Booking, type RentInvoice } from '@/lib/Renter/renterApi';
import RenterCalendar, { type RenterCalendarEvent } from './RenterCalendar';

const money = (value: number | null | undefined) => `KES ${(value ?? 0).toLocaleString('en-KE')}`;
const date = (value?: string | null) => value ? new Date(value).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const status = (value?: string | null) => String(value ?? 'PENDING').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase());

export default function RenterCalendarPage() {
  const { profile } = useAuth();
  const { navigate } = useNav();
  const [invoices, setInvoices] = useState<RentInvoice[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile?.id || profile.role !== 'renter') return;
    setLoading(true);
    setError(null);
    try {
      const calendar = await renterApi.getCalendar(profile.id);
      setInvoices(calendar.invoices ?? []);
      setBookings(calendar.bookings ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load your calendar.');
    } finally {
      setLoading(false);
    }
  }, [profile?.id, profile?.role]);

  useEffect(() => { void load(); }, [load]);

  const events = useMemo<RenterCalendarEvent[]>(() => {
    const movingEvents = bookings
      .filter((booking) => Boolean(booking.moving_date))
      .map((booking) => ({
        id: `moving-${booking.id}`,
        date: booking.moving_date,
        title: 'Moving service',
        detail: `${booking.pickup_address} → ${booking.dropoff_address}`,
        type: 'MOVING' as const,
        status: status(booking.status),
        action: () => navigate('mover-tracking', booking.id),
      }));

    const rentEvents = invoices
      .filter((invoice) => Boolean(invoice.due_date))
      .map((invoice) => ({
        id: `rent-${invoice.id}`,
        date: invoice.due_date,
        title: 'Rent due',
        detail: `${invoice.invoice_number} · ${money(invoice.amount_kes)}`,
        type: 'RENT' as const,
        status: status(invoice.status),
        action: () => navigate('renter-invoices'),
      }));

    return [...movingEvents, ...rentEvents].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [bookings, invoices, navigate]);

  if (!profile || profile.role !== 'renter') return null;

  return (
    <div className="mx-auto max-w-7xl px-2 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <button type="button" onClick={() => navigate('dashboard')} className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
            ← Back to renter dashboard
          </button>
          <h1 className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">Renter Calendar</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Your rent due dates and moving dates.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="btn-secondary inline-flex items-center gap-2 text-sm">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>

      {error && <div className="mb-5 rounded-xl bg-error-50 p-4 text-sm text-error-700 dark:bg-error-900/20 dark:text-error-400">{error}</div>}

      {loading ? (
        <div className="flex min-h-[400px] items-center justify-center">
          <RefreshCw className="h-7 w-7 animate-spin text-brand-500" />
        </div>
      ) : (
        <RenterCalendar events={events} />
      )}
    </div>
  );
}
