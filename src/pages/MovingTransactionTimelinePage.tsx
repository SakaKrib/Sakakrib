import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, FileText, RefreshCw, Truck, WalletCards } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import { protectedGet } from '@/lib/djangoApi';

type TimelineEvent = {
  type: string;
  occurred_at: string;
  title: string;
  description: string;
  status: string | null;
  amount_kes: number | null;
  metadata: Record<string, unknown>;
};

type TimelineBooking = {
  booking_id: string;
  status: string;
  payment_status: string;
  dispute_status: string;
  moving_date?: string;
  events: TimelineEvent[];
};

const money = (value: number | null) => value == null ? '—' : `KES ${Number(value).toLocaleString('en-KE')}`;
const date = (value: string) => new Date(value).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' });
const label = (value: string) => value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

function eventIcon(type: string) {
  if (type.includes('PAYMENT') || type.includes('PAYOUT') || type.includes('ESCROW')) return WalletCards;
  if (type.includes('DISPUTE')) return AlertTriangle;
  if (type.includes('DOCUMENT') || type.includes('INVOICE')) return FileText;
  if (type.includes('BOOKING') || type.includes('JOURNEY') || type.includes('DELIVERY')) return Truck;
  return Clock3;
}

export default function MovingTransactionTimelinePage() {
  const { profile } = useAuth();
  const { navigate } = useNav();
  const [bookings, setBookings] = useState<TimelineBooking[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true); setError(null);
    try {
      const data = await protectedGet<TimelineBooking[]>('/api/core/moving-transaction-timeline/');
      setBookings(data);
      setSelected((current) => current && data.some((item) => item.booking_id === current) ? current : data[0]?.booking_id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load transaction timeline.');
    } finally { setLoading(false); }
  }, [profile?.id]);

  useEffect(() => { void load(); }, [load]);

  const current = bookings.find((item) => item.booking_id === selected) ?? null;
  const isAdmin = profile?.is_admin === true || profile?.is_superuser === true;

  if (loading) return <div className="flex min-h-[400px] items-center justify-center"><RefreshCw className="h-7 w-7 animate-spin text-brand-500" /></div>;

  return <div className="mx-auto max-w-7xl px-3 py-6 sm:px-6 lg:px-8 lg:py-8">
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <button type="button" onClick={() => navigate('dashboard')} className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">← Back to dashboard</button>
        <h1 className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">Moving Transaction Timeline</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">One chronological view of booking, payment, escrow, documents, delivery, disputes and payout events.</p>
      </div>
      <button type="button" onClick={() => void load()} className="btn-secondary inline-flex items-center gap-2 text-sm"><RefreshCw className="h-4 w-4" />Refresh</button>
    </div>

    {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">{error}</div>}

    {bookings.length === 0 ? <div className="card p-10 text-center"><Clock3 className="mx-auto h-9 w-9 text-gray-400" /><p className="mt-3 text-sm text-gray-500 dark:text-gray-400">No moving transaction timeline is available yet.</p></div> : <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
      <div className="card overflow-hidden">
        <div className="border-b border-gray-100 p-4 dark:border-brand-800"><h2 className="font-bold text-gray-900 dark:text-white">{isAdmin ? 'Bookings' : 'Your bookings'}</h2></div>
        <div className="divide-y divide-gray-100 dark:divide-brand-800">
          {bookings.map((booking) => <button key={booking.booking_id} type="button" onClick={() => setSelected(booking.booking_id)} className={`w-full p-4 text-left ${selected === booking.booking_id ? 'bg-brand-50 dark:bg-brand-900/30' : 'hover:bg-gray-50 dark:hover:bg-brand-900/20'}`}>
            <p className="font-semibold text-gray-900 dark:text-white">Booking {booking.booking_id.slice(0, 8)}</p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{booking.moving_date || 'Moving date unavailable'}</p>
            <div className="mt-2 flex flex-wrap gap-1.5"><span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700 dark:bg-brand-900 dark:text-gray-300">{label(booking.status)}</span>{booking.dispute_status === 'OPEN' && <span className="rounded-full bg-yellow-50 px-2 py-0.5 text-[11px] font-medium text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400">Dispute open</span>}</div>
          </button>)}
        </div>
      </div>

      <div className="card overflow-hidden">
        {!current ? <div className="p-10 text-center text-sm text-gray-500">Select a booking.</div> : <>
          <div className="border-b border-gray-100 p-5 dark:border-brand-800">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold text-gray-900 dark:text-white">Booking {current.booking_id.slice(0, 8)}</h2><p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Status: {label(current.status)} · Payment: {label(current.payment_status)}</p></div>{current.dispute_status === 'OPEN' ? <span className="inline-flex items-center gap-1.5 rounded-full bg-yellow-50 px-3 py-1.5 text-xs font-semibold text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400"><AlertTriangle className="h-3.5 w-3.5" /> Release blocked by dispute</span> : <span className="inline-flex items-center gap-1.5 rounded-full bg-success-50 px-3 py-1.5 text-xs font-semibold text-success-700 dark:bg-success-900/20 dark:text-success-400"><CheckCircle2 className="h-3.5 w-3.5" /> No open dispute</span>}</div>
          </div>
          <div className="p-5">
            {current.events.length === 0 ? <div className="p-10 text-center text-sm text-gray-500">No timestamped events yet.</div> : <ol className="relative border-l border-gray-200 pl-6 dark:border-brand-700">
              {current.events.map((event, index) => { const Icon = eventIcon(event.type); return <li key={`${event.type}-${event.occurred_at}-${index}`} className="relative pb-7 last:pb-0">
                <span className="absolute -left-[37px] flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 bg-white text-brand-500 dark:border-brand-700 dark:bg-brand-950"><Icon className="h-3.5 w-3.5" /></span>
                <div className="rounded-xl border border-gray-100 p-4 dark:border-brand-800">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-semibold text-gray-900 dark:text-white">{event.title}</p><p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{date(event.occurred_at)}</p></div><div className="flex items-center gap-2">{event.status && <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 dark:bg-brand-900 dark:text-gray-300">{label(event.status)}</span>}{event.amount_kes != null && <span className="text-sm font-bold text-gray-900 dark:text-white">{money(event.amount_kes)}</span>}</div></div>
                  {event.description && <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{event.description}</p>}
                </div>
              </li>; })}
            </ol>}
          </div>
        </>}
      </div>
    </div>}
  </div>;
}
