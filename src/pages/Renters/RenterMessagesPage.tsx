import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Loader2, MessageCircle, RefreshCw, Truck } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import { renterApi, type Booking } from '@/lib/Renter/renterApi';

const statusLabel = (status: string) => status.replace(/_/g, ' ');

export default function RenterMessagesPage() {
  const { profile } = useAuth();
  const { navigate } = useNav();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile?.id || profile.role !== 'renter') { setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const rows = await renterApi.getBookings(profile.id);
      setBookings(rows ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load your conversations.');
    } finally { setLoading(false); }
  }, [profile?.id, profile?.role]);

  useEffect(() => { void load(); }, [load]);

  const conversations = useMemo(() => {
    const unique = new Map<string, Booking>();
    [...bookings]
      .filter((booking) => Boolean(booking.mover_id))
      .sort((a, b) => new Date(b.updated_at ?? b.created_at ?? 0).getTime() - new Date(a.updated_at ?? a.created_at ?? 0).getTime())
      .forEach((booking) => { if (!unique.has(booking.mover_id)) unique.set(booking.mover_id, booking); });
    return [...unique.entries()];
  }, [bookings]);

  if (loading) return <div className="flex min-h-[420px] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-brand-500" /></div>;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <button type="button" onClick={() => navigate('dashboard')} className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">← Back to dashboard</button>
          <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white"><MessageCircle className="h-6 w-6 text-brand-500" />Messages</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Communicate with movers connected to your moving requests.</p>
        </div>
        <button type="button" onClick={() => void load()} className="btn-secondary inline-flex items-center gap-2 text-sm"><RefreshCw className="h-4 w-4" />Refresh</button>
      </div>

      {error && <div className="mb-5 rounded-xl bg-error-50 p-4 text-sm text-error-700 dark:bg-error-900/20 dark:text-error-400">{error}</div>}

      {conversations.length === 0 ? (
        <div className="card p-12 text-center">
          <MessageCircle className="mx-auto h-10 w-10 text-gray-400" />
          <h2 className="mt-4 font-bold text-gray-900 dark:text-white">No mover conversations yet</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-gray-500 dark:text-gray-400">When you send a moving request to a mover, your conversation will appear here.</p>
          <button type="button" onClick={() => navigate('movers')} className="btn-primary mt-6">Find a mover</button>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="border-b border-gray-100 p-5 dark:border-brand-800"><p className="font-bold text-gray-900 dark:text-white">Your conversations</p><p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{conversations.length} mover conversation{conversations.length === 1 ? '' : 's'}</p></div>
          <div className="divide-y divide-gray-100 dark:divide-brand-800">
            {conversations.map(([moverId, booking]) => (
              <button key={moverId} type="button" onClick={() => navigate('chat', moverId)} className="flex w-full items-center gap-4 p-5 text-left transition hover:bg-gray-50 dark:hover:bg-brand-900/30">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-900/50 dark:text-brand-300"><Truck className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1"><span className="block font-semibold text-gray-900 dark:text-white">Mover</span><span className="mt-1 block truncate text-sm text-gray-500 dark:text-gray-400">{booking.pickup_address} → {booking.dropoff_address}</span><span className="mt-1 block text-xs font-medium uppercase text-brand-600 dark:text-brand-400">{statusLabel(booking.status)}</span></span>
                <ArrowRight className="h-5 w-5 shrink-0 text-gray-400" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
