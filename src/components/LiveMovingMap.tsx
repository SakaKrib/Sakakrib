import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, MapPin, Radio, Truck } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import { moverApi, type MoverBooking, type MoverTrackingPoint, type MoverTrackingResponse } from '@/lib/Movers/moverApi';
import { renterApi } from '@/lib/Renter/renterApi';
import { cn } from '@/lib/utils';

type TrackingPoint = MoverTrackingPoint;
type SocketState = 'connecting' | 'live' | 'reconnecting' | 'offline' | 'closed';
interface MapBooking extends MoverBooking { pickup_latitude: number | null; pickup_longitude: number | null; dropoff_latitude: number | null; dropoff_longitude: number | null; }

const active = (value: string | null | undefined) => String(value ?? '').trim().toLowerCase().replace(/-/g, '_') === 'in_progress';

function socketUrl(bookingId: string) {
  const configured = (import.meta.env.VITE_DJANGO_API_URL as string | undefined)?.replace(/\/+$/, '');
  const url = new URL(configured || window.location.origin, window.location.origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = `/ws/tracking/${encodeURIComponent(bookingId)}/`;
  url.search = '';
  return url.toString();
}

function validCoordinate(value: number | null | undefined) { return typeof value === 'number' && Number.isFinite(value); }
function project(lat: number, lng: number, zoom: number) {
  const scale = 256 * Math.pow(2, zoom);
  const sin = Math.min(Math.max(Math.sin((lat * Math.PI) / 180), -0.9999), 0.9999);
  return { x: ((lng + 180) / 360) * scale, y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale };
}
function zoomForBounds(points: Array<[number, number]>) {
  if (points.length < 2) return 15;
  const lats = points.map(p => p[0]); const lngs = points.map(p => p[1]);
  const latSpan = Math.max(...lats) - Math.min(...lats); const lngSpan = Math.max(...lngs) - Math.min(...lngs);
  const span = Math.max(latSpan, lngSpan * Math.cos((Math.max(...lats) * Math.PI) / 180), 0.002);
  if (span > 1) return 9; if (span > 0.4) return 10; if (span > 0.18) return 11; if (span > 0.08) return 12; if (span > 0.035) return 13; if (span > 0.015) return 14; return 15;
}

export default function LiveMovingMap() {
  const { profile } = useAuth();
  const { view, selectedMoverBookingId, selectedMoverId } = useNav();
  const isMover = profile?.role === 'mover';
  const bookingId = isMover ? selectedMoverBookingId : selectedMoverId;
  const [booking, setBooking] = useState<MapBooking | null>(null);
  const [points, setPoints] = useState<TrackingPoint[]>([]);
  const [socketState, setSocketState] = useState<SocketState>('closed');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<number | null>(null);
  const attemptRef = useRef(0);

  const load = useCallback(async () => {
    if (!bookingId) { setLoading(false); return null; }
    try {
      const [tracking, selectedBooking] = isMover
        ? await Promise.all([moverApi.getTracking(bookingId), moverApi.getBooking(bookingId)])
        : await Promise.all([renterApi.getTracking(bookingId), renterApi.getBooking(bookingId)]);
      const trackingData = tracking as MoverTrackingResponse;
      const bookingData = selectedBooking as MapBooking;
      setBooking({ ...bookingData, ...(trackingData.booking as Partial<MapBooking>) });
      setPoints(trackingData.tracking_points ?? []);
      setError(null);
      return trackingData;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load live map.');
      return null;
    } finally { setLoading(false); }
  }, [bookingId, isMover]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!bookingId || !booking || !active(booking.status)) {
      socketRef.current?.close(); socketRef.current = null;
      if (reconnectRef.current !== null) window.clearTimeout(reconnectRef.current);
      reconnectRef.current = null; setSocketState('closed'); return;
    }
    let disposed = false;
    const clearTimer = () => { if (reconnectRef.current !== null) window.clearTimeout(reconnectRef.current); reconnectRef.current = null; };
    const schedule = () => {
      if (disposed || !navigator.onLine) { setSocketState('offline'); return; }
      clearTimer(); setSocketState('reconnecting');
      const delay = Math.min(15000, 750 * Math.pow(2, Math.min(attemptRef.current++, 4)));
      reconnectRef.current = window.setTimeout(connect, delay);
    };
    const connect = () => {
      if (disposed) return;
      clearTimer(); socketRef.current?.close(); setSocketState(attemptRef.current ? 'reconnecting' : 'connecting');
      let socket: WebSocket;
      try { socket = new WebSocket(socketUrl(bookingId)); } catch { schedule(); return; }
      socketRef.current = socket;
      socket.onopen = () => { if (socketRef.current !== socket) return; attemptRef.current = 0; setSocketState('live'); };
      socket.onmessage = event => {
        if (socketRef.current !== socket) return;
        try {
          const message = JSON.parse(event.data) as { type?: string; location?: TrackingPoint | null };
          const point = message.location;
          if (!point || (message.type !== 'location' && message.type !== 'ready')) return;
          setPoints(previous => {
            if (previous.some(item => item.id === point.id)) return previous;
            return [point, ...previous].sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime()).slice(0, 100);
          });
          setBooking(previous => previous ? { ...previous, last_known_latitude: point.latitude, last_known_longitude: point.longitude, last_location_at: point.recorded_at } : previous);
        } catch { /* Ignore malformed frames. */ }
      };
      socket.onerror = () => { if (socketRef.current === socket) setSocketState('reconnecting'); };
      socket.onclose = () => { if (!disposed && socketRef.current === socket) { socketRef.current = null; void load().then(snapshot => { if (snapshot && active(snapshot.booking.status)) schedule(); }); } };
    };
    const recover = () => { attemptRef.current = 0; void load().then(snapshot => { if (snapshot && active(snapshot.booking.status)) connect(); }); };
    window.addEventListener('online', recover); window.addEventListener('offline', () => setSocketState('offline')); connect();
    return () => { disposed = true; clearTimer(); socketRef.current?.close(); socketRef.current = null; window.removeEventListener('online', recover); };
  }, [bookingId, booking?.status, load]);

  const latest = useMemo(() => [...points].sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime())[0] ?? null, [points]);
  const locations = useMemo(() => {
    const result: Array<[number, number]> = [];
    if (validCoordinate(booking?.pickup_latitude) && validCoordinate(booking?.pickup_longitude)) result.push([booking!.pickup_latitude!, booking!.pickup_longitude!]);
    if (validCoordinate(booking?.dropoff_latitude) && validCoordinate(booking?.dropoff_longitude)) result.push([booking!.dropoff_latitude!, booking!.dropoff_longitude!]);
    if (latest) result.push([latest.latitude, latest.longitude]);
    return result;
  }, [booking, latest]);
  const zoom = zoomForBounds(locations);
  const center = useMemo(() => {
    if (!locations.length) return { lat: -4.0435, lng: 39.6682 };
    return { lat: locations.reduce((sum, p) => sum + p[0], 0) / locations.length, lng: locations.reduce((sum, p) => sum + p[1], 0) / locations.length };
  }, [locations]);
  const mapCenter = project(center.lat, center.lng, zoom);
  const tileX = Math.floor(mapCenter.x / 256); const tileY = Math.floor(mapCenter.y / 256); const maxTile = Math.pow(2, zoom) - 1;
  const tileSize = 256; const offsetX = mapCenter.x - (tileX * tileSize); const offsetY = mapCenter.y - (tileY * tileSize);
  const viewportWidth = 900; const viewportHeight = 430;
  const routePoints = points.slice(0, 100).reverse().map(point => project(point.latitude, point.longitude, zoom));
  const svgPoints = routePoints.map(p => `${viewportWidth / 2 + (p.x - mapCenter.x)},${viewportHeight / 2 + (p.y - mapCenter.y)}`).join(' ');
  const marker = latest ? project(latest.latitude, latest.longitude, zoom) : null;
  const markerLeft = marker ? viewportWidth / 2 + (marker.x - mapCenter.x) : null;
  const markerTop = marker ? viewportHeight / 2 + (marker.y - mapCenter.y) : null;

  if (!bookingId) return null;
  if (loading) return <div className="flex h-[430px] items-center justify-center rounded-2xl border bg-white shadow-sm dark:border-brand-800 dark:bg-brand-900"><Loader2 className="h-7 w-7 animate-spin text-brand-500" /></div>;
  if (error && !booking) return <div className="rounded-2xl border border-error-200 bg-error-50 p-5 text-sm text-error-700 dark:border-error-800 dark:bg-error-900/20">{error}</div>;

  return <section className="overflow-hidden rounded-2xl border bg-white shadow-sm dark:border-brand-800 dark:bg-brand-900">
    <div className="flex items-center justify-between gap-3 border-b px-4 py-3 dark:border-brand-800">
      <div><h2 className="font-semibold text-gray-900 dark:text-white">Live journey map</h2><p className="text-xs text-gray-500 dark:text-gray-400">{isMover ? 'Your live position and journey route' : 'Follow your mover in real time'}</p></div>
      <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold', socketState === 'live' ? 'bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-400' : 'bg-gray-100 text-gray-600 dark:bg-brand-800 dark:text-gray-300')}><Radio className="h-3.5 w-3.5" /> {socketState === 'live' ? 'Live' : socketState}</span>
    </div>
    <div className="relative h-[430px] overflow-hidden bg-gray-100 dark:bg-brand-950" aria-label="Live moving map">
      <div className="absolute inset-0" style={{ left: `${viewportWidth / 2 - offsetX}px`, top: `${viewportHeight / 2 - offsetY}px` }}>
        {[-2,-1,0,1,2].flatMap(dx => [-2,-1,0,1,2].map(dy => { const x = tileX + dx; const y = tileY + dy; if (x < 0 || x > maxTile || y < 0 || y > maxTile) return null; return <img key={`${x}-${y}`} src={`https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`} alt="" draggable={false} className="absolute h-64 w-64 max-w-none" style={{ left: dx * 256, top: dy * 256 }} />; }))}
      </div>
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${viewportWidth} ${viewportHeight}`} preserveAspectRatio="none">
        {svgPoints && <polyline points={svgPoints} fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" className="text-brand-500 opacity-80" />}
        {validCoordinate(booking?.pickup_latitude) && validCoordinate(booking?.pickup_longitude) && (() => { const p = project(booking!.pickup_latitude!, booking!.pickup_longitude!, zoom); return <circle cx={viewportWidth / 2 + p.x - mapCenter.x} cy={viewportHeight / 2 + p.y - mapCenter.y} r="9" className="fill-white stroke-success-600" strokeWidth="4" />; })()}
        {validCoordinate(booking?.dropoff_latitude) && validCoordinate(booking?.dropoff_longitude) && (() => { const p = project(booking!.dropoff_latitude!, booking!.dropoff_longitude!, zoom); return <circle cx={viewportWidth / 2 + p.x - mapCenter.x} cy={viewportHeight / 2 + p.y - mapCenter.y} r="9" className="fill-white stroke-error-600" strokeWidth="4" />; })()}
      </svg>
      {markerLeft !== null && markerTop !== null && <div className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2" style={{ left: markerLeft, top: markerTop }}><div className="flex h-12 w-12 items-center justify-center rounded-full border-4 border-white bg-brand-600 text-white shadow-lg"><Truck className="h-6 w-6" /></div></div>}
      <div className="absolute bottom-3 left-3 rounded-xl bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur dark:bg-brand-900/95 dark:text-white"><div className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-full border-2 border-success-600 bg-white" /> Pickup <span className="ml-2 inline-block h-3 w-3 rounded-full border-2 border-error-600 bg-white" /> Drop-off</div></div>
      {latest && <div className="absolute right-3 top-3 rounded-xl bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur dark:bg-brand-900/95 dark:text-white"><div className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-brand-500" /> Updated {new Date(latest.recorded_at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}</div>{latest.speed_kph != null && <div className="mt-1 text-gray-500 dark:text-gray-400">{latest.speed_kph.toFixed(1)} km/h</div>}</div>}
      {!latest && <div className="absolute inset-0 flex items-center justify-center"><div className="rounded-xl bg-white/95 px-4 py-3 text-sm shadow-lg dark:bg-brand-900/95 dark:text-white">Waiting for the mover's first GPS location…</div></div>}
    </div>
    <div className="grid gap-3 border-t p-4 text-sm sm:grid-cols-2 dark:border-brand-800"><div><p className="text-xs text-gray-500">Pickup</p><p className="mt-1 font-medium text-gray-900 dark:text-white">{booking?.pickup_address || '—'}</p></div><div><p className="text-xs text-gray-500">Drop-off</p><p className="mt-1 font-medium text-gray-900 dark:text-white">{booking?.dropoff_address || '—'}</p></div></div>
    <p className="border-t px-4 py-2 text-[11px] text-gray-400 dark:border-brand-800">Map data © OpenStreetMap contributors</p>
  </section>;
}
