import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import { renterApi, type Booking, type RentInvoice } from '@/lib/Renter/renterApi';
import RenterCalendar, { type RenterCalendarEvent } from './RenterCalendar';

const money = (value: number | null | undefined) => `KES ${(value ?? 0).toLocaleString('en-KE')}`;
const status = (value?: string | null) => String(value ?? 'PENDING').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase());
const todayKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

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
    const movingEvents: RenterCalendarEvent[] = [];

    bookings.forEach((booking) => {
      const bookingStatus = String(booking.status ?? '').toLowerCase();
      const paymentStatus = String(booking.payment_status ?? '').toLowerCase();

      if (bookingStatus === 'cancelled' || bookingStatus === 'completed') return;

      const scheduledDate = booking.scheduled_start_at || booking.moving_date;
      if (scheduledDate) {
        const isPending = bookingStatus === 'pending';
        const isUnpaid = paymentStatus !== 'paid';
        movingEvents.push({
          id: `moving-${booking.id}`,
          date: scheduledDate,
          title: isPending ? 'Mover response pending' : 'Moving service scheduled',
          detail: `${booking.pickup_address} → ${booking.dropoff_address}${booking.scheduled_start_at ? ` · ${new Date(booking.scheduled_start_at).toLocaleTimeString('en-KE', { hour: 'numeric', minute: '2-digit' })}` : ''}`,
          type: 'MOVING',
          status: isPending ? status(booking.status) : status(booking.status),
          actionLabel: isPending ? 'View booking' : isUnpaid ? 'Complete payment' : 'View move',
          action: () => {
            if (isPending) {
              navigate('dashboard');
            } else if (isUnpaid) {
              navigate('renter-payment');
            } else {
              navigate('mover-tracking', booking.id);
            }
          },
        });
      }

      if (bookingStatus === 'in_progress' && !booking.renter_confirmed_delivery_at) {
        movingEvents.push({
          id: `delivery-${booking.id}`,
          date: todayKey(),
          title: 'Confirm belongings received',
          detail: 'Your moving journey is in progress. Confirm delivery when your belongings have arrived safely.',
          type: 'MOVING',
          status: 'Action required',
          actionLabel: 'Confirm delivery',
          action: async () => {
            await renterApi.confirmMovingDelivery(booking.id);
            await load();
          },
        });
      }
    });

    const rentEvents: RenterCalendarEvent[] = invoices
      .filter((invoice) => {
        const invoiceStatus = String(invoice.status ?? '').toLowerCase();
        return Boolean(invoice.due_date) && !['paid', 'cancelled', 'refunded'].includes(invoiceStatus);
      })
      .map((invoice) => ({
        id: `rent-${invoice.id}`,
        date: invoice.due_date,
        title: 'Rent payment due',
        detail: `${invoice.invoice_number} · ${money(invoice.amount_kes)}`,
        type: 'RENT' as const,
        status: status(invoice.status),
        actionLabel: 'View invoice',
        action: () => navigate('renter-invoices'),
      }));

    return [...movingEvents, ...rentEvents].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [bookings, invoices, load, navigate]);

  if (!profile || profile.role !== 'renter') return null;

  return (
    <div className="mx-auto max-w-7xl px-2 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <button type="button" onClick={() => navigate('dashboard')} className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
            ← Back to renter dashboard
          </button>
          <h1 className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">Renter Calendar</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Your scheduled moves, rent due dates, and outstanding renter actions.</p>
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
