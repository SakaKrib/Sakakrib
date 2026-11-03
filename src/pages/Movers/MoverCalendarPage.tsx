import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import { useLiveEvents } from '@/lib/useLiveEvents';
import { moverApi, type MoverScheduleEvent } from '@/lib/Movers';
import MoverCalendar from './MoverCalendar';

export default function MoverCalendarPage() {
  const { event: liveEvent } = useLiveEvents(true);
  const { profile } = useAuth();
  const { navigate } = useNav();
  const [schedule, setSchedule] = useState<MoverScheduleEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (silent = false) => {
    if (!profile?.id || profile.role !== 'mover') return;
    if (!silent) setLoading(true);
    try {
      setSchedule(await moverApi.getSchedule());
    } finally {
      setLoading(false);
    }
  }, [profile?.id, profile?.role]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const shouldRefresh =
      (liveEvent?.type === 'ready' && liveEvent.reconnected) ||
      (liveEvent?.type === 'resource.updated' &&
        ['schedules', 'bookings', 'notifications'].includes(liveEvent.resource ?? ''));
    if (shouldRefresh) void load(true);
  }, [liveEvent, load]);

  if (loading) return <div className="flex min-h-[400px] items-center justify-center"><RefreshCw className="h-7 w-7 animate-spin text-brand-500" /></div>;

  return (
    <div className="mx-auto max-w-7xl px-2 py-6 sm:px-6 lg:px-8 lg:py-8">
      <button type="button" onClick={() => navigate('dashboard')} className="mb-5 text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">← Back to mover dashboard</button>
      <MoverCalendar schedule={schedule} onOpen={(bookingId) => navigate('mover-booking-detail', bookingId)} />
    </div>
  );
}
