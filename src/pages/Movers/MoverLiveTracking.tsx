import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, MapPin, Navigation, RefreshCw, Radio, Truck } from 'lucide-react';
import { useNav } from '@/context/NavContext';
import { moverApi, type MoverTrackingPoint, type MoverTrackingResponse } from '@/lib/Movers/moverApi';
import { cn } from '@/lib/utils';

type SocketState = 'connecting' | 'live' | 'reconnecting' | 'offline' | 'closed';

const active = (status: string | null | undefined) =>
  String(status ?? '').trim().toLowerCase().replace(/-/g, '_') === 'in_progress';

function socketUrl(bookingId: string) {
  const configured = (import.meta.env.VITE_DJANGO_API_URL as string | undefined)?.replace(/\/+$/, '');
  const url = new URL(configured || window.location.origin, window.location.origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = `/ws/tracking/${encodeURIComponent(bookingId)}/`;
  url.search = '';
  return url.toString();
}

function latest(points: MoverTrackingPoint[]) {
  return [...points].sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime())[0] ?? null;
}

export default function MoverLiveTracking() {
  const { selectedMoverBookingId, navigate } = useNav();
  const bookingId = selectedMoverBookingId;
  const [data, setData] = useState<MoverTrackingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [socketState, setSocketState] = useState<SocketState>('closed');
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<number | null>(null);
  const attemptRef = useRef(0);

  const load = useCallback(async (silent = false) => {
    if (!bookingId) { setError('No moving booking was selected.'); setLoading(false); return null; }
    silent ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const response = await moverApi.getTracking(bookingId);
      setData(response);
      return response;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load live tracking.');
      return null;
    } finally { setLoading(false); setRefreshing(false); }
  }, [bookingId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!bookingId || !data || !active(data.booking.status)) {
      socketRef.current?.close(); socketRef.current = null;
      if (reconnectRef.current !== null) window.clearTimeout(reconnectRef.current);
      reconnectRef.current = null; setSocketState('closed'); return;
    }

    let disposed = false;
    const clearTimer = () => { if (reconnectRef.current !== null) window.clearTimeout(reconnectRef.current); reconnectRef.current = null; };
    const schedule = () => {
      if (disposed || !navigator.onLine) { setSocketState('offline'); return; }
      clearTimer();
      const delay = Math.min(15000, 750 * Math.pow(2, Math.min(attemptRef.current++, 4)));
      setSocketState('reconnecting');
      reconnectRef.current = window.setTimeout(connect, delay);
    };
    const recover = () => { if (!disposed) void load(true).then(snapshot => { if (snapshot && active(snapshot.booking.status)) connect(); }); };
    const connect = () => {
      if (disposed) return;
      clearTimer(); socketRef.current?.close();
      setSocketState(attemptRef.current ? 'reconnecting' : 'connecting');
      let socket: WebSocket;
      try { socket = new WebSocket(socketUrl(bookingId)); } catch { schedule(); return; }
      socketRef.current = socket;
      socket.onopen = () => { if (socketRef.current !== socket) return; attemptRef.current = 0; setSocketState('live'); };
      socket.onmessage = event => {
        if (socketRef.current !== socket) return;
        try {
          const message = JSON.parse(event.data) as { type?: string; location?: MoverTrackingPoint | null };
          if (!message.location || (message.type !== 'location' && message.type !== 'ready')) return;
          const point = message.location;
          setData(previous => {
            if (!previous) return previous;
            const existing = previous.tracking_points.some(item => item.id === point.id);
            const points = [point, ...previous.tracking_points.filter(item => item.id !== point.id)].sort((a,b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime()).slice(0, 50);
            return { ...previous, booking: { ...previous.booking, last_known_latitude: point.latitude, last_known_longitude: point.longitude, last_location_at: point.recorded_at }, mover: previous.mover ? { ...previous.mover, current_latitude: point.latitude, current_longitude: point.longitude, location_updated_at: point.recorded_at } : previous.mover, tracking_points: existing ? previous.tracking_points : points };
          });
        } catch { /* Ignore malformed socket frames; HTTP remains authoritative. */ }
      };
      socket.onerror = () => setSocketState('reconnecting');
      socket.onclose = () => { if (!disposed && socketRef.current === socket) { socketRef.current = null; recover(); } };
    };
    const online = () => { attemptRef.current = 0; recover(); };
    const visibility = () => { if (document.visibilityState === 'visible' && (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN)) recover(); };
    window.addEventListener('online', online); document.addEventListener('visibilitychange', visibility); connect();
    return () => { disposed = true; clearTimer(); socketRef.current?.close(); socketRef.current = null; window.removeEventListener('online', online); document.removeEventListener('visibilitychange', visibility); };
  }, [bookingId, data?.booking.status, load]);

  const point = useMemo(() => data ? latest(data.tracking_points) : null, [data]);
  const lat = point?.latitude ?? data?.booking.last_known_latitude ?? null;
  const lng = point?.longitude ?? data?.booking.last_known_longitude ?? null;
  const statusLabel = data?.booking.status?.replace(/_/g, ' ') || 'Unknown';

  if (loading) return <div className="mx-auto flex min-h-[500px] max-w-5xl items-center justify-center"><RefreshCw className="h-8 w-8 animate-spin text-brand-500" /></div>;

  return <section className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
    <div className="mb-6 flex items-center justify-between gap-4">
      <button onClick={() => navigate('mover-booking-detail', bookingId ?? undefined)} className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-brand-600 dark:text-gray-300"><ArrowLeft className="h-4 w-4" /> Booking</button>
      <button onClick={() => void load(true)} disabled={refreshing} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} /> Refresh</button>
    </div>
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-bold text-gray-900 dark:text-white">Live moving tracking</h1><p className="mt-1 text-sm text-gray-500">Booking {bookingId}</p></div>
      <span className={cn('inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium', socketState === 'live' ? 'bg-success-50 text-success-700' : 'bg-gray-100 text-gray-700')}><Radio className="h-4 w-4" /> {socketState}</span>
    </div>
    {error && <div className="mb-5 rounded-xl border border-error-200 bg-error-50 p-4 text-sm text-error-700">{error}</div>}
    {!data ? null : <>
      <div className="grid gap-5 md:grid-cols-2">
        <div className="rounded-2xl border bg-white p-6 shadow-sm dark:border-brand-800 dark:bg-brand-900">
          <div className="flex items-center gap-3"><Truck className="h-5 w-5 text-brand-500" /><h2 className="font-semibold">Journey status</h2></div>
          <p className="mt-4 text-2xl font-bold capitalize">{statusLabel}</p>
          <p className="mt-2 text-sm text-gray-500">Tracking number: {data.booking.tracking_number || '—'}</p>
          <p className="mt-1 text-sm text-gray-500">Started: {data.booking.started_at ? new Date(data.booking.started_at).toLocaleString('en-KE') : '—'}</p>
        </div>
        <div className="rounded-2xl border bg-white p-6 shadow-sm dark:border-brand-800 dark:bg-brand-900">
          <div className="flex items-center gap-3"><MapPin className="h-5 w-5 text-brand-500" /><h2 className="font-semibold">Current position</h2></div>
          <p className="mt-4 text-lg font-semibold">{lat !== null && lng !== null ? `${lat.toFixed(6)}, ${lng.toFixed(6)}` : 'Waiting for GPS location'}</p>
          <p className="mt-2 text-sm text-gray-500">Last update: {point?.recorded_at || data.booking.last_location_at ? new Date(point?.recorded_at || data.booking.last_location_at!).toLocaleString('en-KE') : '—'}</p>
          {point?.speed_kph != null && <p className="mt-1 text-sm text-gray-500">Speed: {point.speed_kph.toFixed(1)} km/h</p>}
        </div>
      </div>
      <div className="mt-5 rounded-2xl border bg-white p-6 shadow-sm dark:border-brand-800 dark:bg-brand-900">
        <div className="flex items-center justify-between"><h2 className="font-semibold">Recent GPS points</h2><Navigation className="h-5 w-5 text-brand-500" /></div>
        {data.tracking_points.length === 0 ? <p className="mt-4 text-sm text-gray-500">No accepted GPS points have been recorded yet. Keep the journey active and allow location access.</p> : <div className="mt-4 space-y-2">{data.tracking_points.slice(0, 10).map(item => <div key={item.id} className="flex flex-wrap justify-between gap-2 rounded-lg bg-gray-50 p-3 text-sm dark:bg-brand-950"><span>{item.latitude.toFixed(6)}, {item.longitude.toFixed(6)}</span><span className="text-gray-500">{new Date(item.recorded_at).toLocaleString('en-KE')}</span></div>)}</div>}
      </div>
    </>}
  </section>;
}
