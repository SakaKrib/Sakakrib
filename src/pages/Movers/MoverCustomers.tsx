import { RefreshCw, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import { moverApi, type MoverBooking } from '@/lib/Movers';
import MoverCustomersCard from './MoverCustomersCard';

export default function MoverCustomers() {
  const { profile } = useAuth();
  const { navigate } = useNav();
  const [bookings, setBookings] = useState<MoverBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { if (!profile?.id || profile.role !== 'mover') return; setLoading(true); try { setBookings(await moverApi.getBookings()); } finally { setLoading(false); } }, [profile?.id, profile?.role]);
  useEffect(() => { void load(); }, [load]);
  const customerCount = useMemo(() => new Set(bookings.map((b) => b.renter_id).filter(Boolean)).size, [bookings]);
  if (loading) return <div className="flex min-h-[400px] items-center justify-center"><RefreshCw className="h-7 w-7 animate-spin text-brand-500" /></div>;
  return <div className="mx-auto max-w-7xl px-2 py-6 sm:px-6 lg:px-8 lg:py-8"><div className="mb-6 flex items-start justify-between gap-4"><div><button type="button" onClick={() => navigate('dashboard')} className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">← Back to dashboard</button><h1 className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">Customers</h1><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Customers connected to your mover bookings.</p></div><button type="button" onClick={() => void load()} className="btn-secondary inline-flex items-center gap-2 text-sm"><RefreshCw className="h-4 w-4" />Refresh</button></div><div className="mb-5 flex items-center gap-3 rounded-xl bg-brand-50 p-4 dark:bg-brand-900/20"><Users className="h-5 w-5 text-brand-600 dark:text-brand-400" /><span className="text-sm font-semibold text-gray-900 dark:text-white">{customerCount} unique customer{customerCount === 1 ? '' : 's'}</span></div><MoverCustomersCard bookings={bookings} onOpenBooking={(bookingId) => navigate('mover-booking-detail', bookingId)} /></div>;
}
