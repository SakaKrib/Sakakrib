import { BriefcaseBusiness, CalendarDays, MapPin, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import { moverApi, type MoverBooking } from '@/lib/Movers';

const activeStatuses = new Set(['confirmed', 'scheduled', 'in_progress', 'started']);

export default function MoverUpcomingJobsPage() {
  const { profile } = useAuth();
  const { navigate } = useNav();
  const [bookings, setBookings] = useState<MoverBooking[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile?.id || profile.role !== 'mover') return;
    setLoading(true);
    try { setBookings(await moverApi.getBookings()); } finally { setLoading(false); }
  }, [profile?.id, profile?.role]);

  useEffect(() => { void load(); }, [load]);

  const jobs = useMemo(() => bookings.filter((booking) => activeStatuses.has((booking.status ?? '').toLowerCase()) && (booking.moving_date || booking.scheduled_start_at)).sort((a, b) => new Date(a.scheduled_start_at ?? a.moving_date ?? '').getTime() - new Date(b.scheduled_start_at ?? b.moving_date ?? '').getTime()), [bookings]);

  if (loading) return <div className="flex min-h-[400px] items-center justify-center"><RefreshCw className="h-7 w-7 animate-spin text-brand-500" /></div>;

  return (
    <div className="mx-auto max-w-7xl px-2 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mb-6 flex items-start justify-between gap-4"><div><button type="button" onClick={() => navigate('dashboard')} className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">← Back to dashboard</button><h1 className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">Upcoming jobs</h1><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Confirmed and scheduled moving jobs.</p></div><button type="button" onClick={() => void load()} className="btn-secondary inline-flex items-center gap-2 text-sm"><RefreshCw className="h-4 w-4" />Refresh</button></div>
      {jobs.length === 0 ? <div className="card p-10 text-center"><BriefcaseBusiness className="mx-auto h-10 w-10 text-gray-400" /><p className="mt-3 font-semibold text-gray-900 dark:text-white">No upcoming jobs</p><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Confirmed jobs will appear here.</p></div> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{jobs.map((job) => <button key={job.id} type="button" onClick={() => navigate('mover-booking-detail', job.id)} className="card p-5 text-left transition hover:-translate-y-0.5 hover:shadow-md"><div className="flex items-center justify-between gap-3"><span className="rounded-full bg-success-50 px-2.5 py-1 text-xs font-semibold text-success-700 dark:bg-success-900/20 dark:text-success-300">{job.status ?? 'Scheduled'}</span>{job.moving_date && <span className="text-xs text-gray-500 dark:text-gray-400">{new Date(job.moving_date).toLocaleDateString()}</span>}</div><div className="mt-4 space-y-2 text-sm text-gray-700 dark:text-gray-300"><p className="flex gap-2"><MapPin className="h-4 w-4 shrink-0 text-brand-500" />{job.pickup_address}</p><p className="flex gap-2"><MapPin className="h-4 w-4 shrink-0 text-brand-500" />{job.dropoff_address}</p><p className="flex gap-2"><CalendarDays className="h-4 w-4 shrink-0 text-brand-500" />{job.scheduled_start_at ? new Date(job.scheduled_start_at).toLocaleString() : 'Date pending'}</p></div></button>)}</div>}
    </div>
  );
}
