import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, MapPin, Navigation, RefreshCw, Radio, Truck } from 'lucide-react';
import { useNav } from '@/context/NavContext';
import { moverApi, type MoverTrackingPoint, type MoverTrackingResponse } from '@/lib/Movers/moverApi';
import { getDjangoWebSocketUrl } from '@/lib/djangoApi';
import { cn } from '@/lib/utils';
import { Capacitor } from '@capacitor/core';
import LiveLocationPrompt from '@/components/LiveLocationPrompt';
import { checkLocationPermission, isLocationSupported, requestPosition } from '@/lib/location';

type SocketState = 'connecting' | 'live' | 'reconnecting' | 'offline' | 'closed';
type GpsState = 'idle' | 'checking' | 'requesting' | 'received' | 'denied' | 'unavailable' | 'timeout';
type DeviceGpsPosition = Pick<GeolocationCoordinates, 'latitude' | 'longitude' | 'accuracy' | 'speed' | 'heading'>;
type DeviceGpsEventDetail = DeviceGpsPosition & { timestamp?: number; bookingId?: string };
const active = (status: string | null | undefined) => String(status ?? '').trim().toLowerCase().replace(/-/g, '_') === 'in_progress';
function socketUrl(bookingId: string) { return getDjangoWebSocketUrl(`/ws/tracking/${encodeURIComponent(bookingId)}/`); }
function latest(points: MoverTrackingPoint[]) { return [...points].sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime())[0] ?? null; }

export default function MoverLiveTracking() {
  const { selectedMoverBookingId, navigate } = useNav();
  const bookingId = selectedMoverBookingId;
  const [data, setData] = useState<MoverTrackingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gpsMessage, setGpsMessage] = useState<string | null>(null);
  const [gpsState, setGpsState] = useState<GpsState>('idle');
  const [gpsPermission, setGpsPermission] = useState<string>('unknown');
  const [gpsPosition, setGpsPosition] = useState<DeviceGpsPosition | null>(null);
  const [gpsReceivedAt, setGpsReceivedAt] = useState<number | null>(null);
  const gpsTimeoutRef = useRef<number | null>(null);
  const [socketState, setSocketState] = useState<SocketState>('closed');
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<number | null>(null);
  const attemptRef = useRef(0);

  const requestGps = useCallback(() => {
    if (!bookingId || !isLocationSupported()) { setGpsState('unavailable'); setGpsMessage('Live location is not available in this browser.'); return; }
    if (gpsTimeoutRef.current !== null) window.clearTimeout(gpsTimeoutRef.current);
    setGpsState('requesting');
    setGpsPosition(null);
    setGpsReceivedAt(null);
    setGpsMessage('Requesting GPS location from this browser…');
    window.dispatchEvent(new Event('sakakrib:request-mover-gps'));
    gpsTimeoutRef.current = window.setTimeout(() => {
      gpsTimeoutRef.current = null;
      setGpsState('timeout');
      setGpsMessage('The browser has not returned a GPS position yet. Check the browser location prompt/permission and try again.');
    }, 22000);
    requestPosition(
      position => {
        if (gpsTimeoutRef.current !== null) window.clearTimeout(gpsTimeoutRef.current);
        gpsTimeoutRef.current = null;
        setGpsState('received');
        setGpsPosition(position.coords);
        setGpsReceivedAt(position.timestamp || Date.now());
        setGpsMessage(`GPS position received. Accuracy: ${Number.isFinite(position.coords.accuracy) ? `${Math.round(position.coords.accuracy)} m` : 'unknown'}. This device position is shown above while Django receives the update.`);
      },
      err => {
        if (gpsTimeoutRef.current !== null) window.clearTimeout(gpsTimeoutRef.current);
        gpsTimeoutRef.current = null;
        if (err.code === 'permission_denied') {
          setGpsState('denied');
          setGpsMessage(err.message);
        } else if (err.code === 'services_off') {
          setGpsState('unavailable');
          setGpsMessage(err.message);
        } else {
          setGpsState('timeout');
          setGpsMessage(err.message);
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
  }, [bookingId]);

  useEffect(() => {
    const handleDeviceGps = (event: Event) => {
      const detail = (event as CustomEvent<DeviceGpsEventDetail>).detail;
      if (!detail || !Number.isFinite(detail.latitude) || !Number.isFinite(detail.longitude)) return;
      if (detail.bookingId && bookingId && detail.bookingId !== bookingId) return;
      setGpsPosition({
        latitude: detail.latitude,
        longitude: detail.longitude,
        accuracy: detail.accuracy,
        speed: detail.speed,
        heading: detail.heading,
      });
      setGpsReceivedAt(detail.timestamp || Date.now());
      setGpsState('received');
      setGpsMessage(`Fresh device GPS received. Accuracy: ${Number.isFinite(detail.accuracy) ? `${Math.round(detail.accuracy)} m` : 'unknown'}.`);
    };
    window.addEventListener('sakakrib:mover-gps-position', handleDeviceGps);
    return () => window.removeEventListener('sakakrib:mover-gps-position', handleDeviceGps);
  }, [bookingId]);

  useEffect(() => {
    let disposed = false;
    // In the Android app the browser Permissions API can disagree with the native permission,
    // so ask the native plugin through the shared helper.
    if (Capacitor.isNativePlatform()) {
      setGpsPermission('checking');
      checkLocationPermission()
        .then((state) => { if (!disposed) setGpsPermission(state); })
        .catch(() => { if (!disposed) setGpsPermission('not reported by browser'); });
      return () => { disposed = true; if (gpsTimeoutRef.current !== null) window.clearTimeout(gpsTimeoutRef.current); };
    }
    if (!('geolocation' in navigator)) { setGpsPermission('unsupported'); return; }
    setGpsPermission('checking');
    const permissions = navigator.permissions;
    if (!permissions?.query) { setGpsPermission('not reported by browser'); return; }
    permissions.query({ name: 'geolocation' as PermissionName }).then(status => {
      if (disposed) return;
      setGpsPermission(status.state);
      const handleChange = () => setGpsPermission(status.state);
      status.addEventListener('change', handleChange);
    }).catch(() => { if (!disposed) setGpsPermission('not reported by browser'); });
    return () => {
      disposed = true;
      if (gpsTimeoutRef.current !== null) window.clearTimeout(gpsTimeoutRef.current);
    };
  }, []);

  const load = useCallback(async (silent = false) => {
    if (!bookingId) { setError('No moving booking was selected.'); setLoading(false); return null; }
    silent ? setRefreshing(true) : setLoading(true); setError(null);
    try { const response = await moverApi.getTracking(bookingId); setData(response); return response; }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to load live tracking.'); return null; }
    finally { setLoading(false); setRefreshing(false); }
  }, [bookingId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!bookingId || !data || !active(data.booking.status)) { socketRef.current?.close(); socketRef.current = null; if (reconnectRef.current !== null) window.clearTimeout(reconnectRef.current); reconnectRef.current = null; setSocketState('closed'); return; }
    let disposed = false;
    const clearTimer = () => { if (reconnectRef.current !== null) window.clearTimeout(reconnectRef.current); reconnectRef.current = null; };
    const schedule = () => { if (disposed || !navigator.onLine) { setSocketState('offline'); return; } clearTimer(); const delay = Math.min(15000, 750 * Math.pow(2, Math.min(attemptRef.current++, 4))); setSocketState('reconnecting'); reconnectRef.current = window.setTimeout(connect, delay); };
    const recover = () => { if (!disposed) void load(true).then(snapshot => { if (snapshot && active(snapshot.booking.status)) connect(); }); };
    const connect = () => {
      if (disposed) return; clearTimer(); socketRef.current?.close(); setSocketState(attemptRef.current ? 'reconnecting' : 'connecting');
      let socket: WebSocket; try { socket = new WebSocket(socketUrl(bookingId)); } catch { schedule(); return; }
      socketRef.current = socket;
      socket.onopen = () => { if (socketRef.current !== socket) return; attemptRef.current = 0; setSocketState('live'); };
      socket.onmessage = event => { if (socketRef.current !== socket) return; try { const message = JSON.parse(event.data) as { type?: string; location?: MoverTrackingPoint | null }; if (!message.location || (message.type !== 'location' && message.type !== 'ready')) return; const point = message.location; setData(previous => { if (!previous) return previous; const existing = previous.tracking_points.some(item => item.id === point.id); const points = [point, ...previous.tracking_points.filter(item => item.id !== point.id)].sort((a,b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime()).slice(0, 50); return { ...previous, booking: { ...previous.booking, last_known_latitude: point.latitude, last_known_longitude: point.longitude, last_location_at: point.recorded_at }, mover: previous.mover ? { ...previous.mover, current_latitude: point.latitude, current_longitude: point.longitude, location_updated_at: point.recorded_at } : previous.mover, tracking_points: existing ? previous.tracking_points : points }; }); } catch { /* Ignore malformed socket frames; HTTP remains authoritative. */ } };
      socket.onerror = () => setSocketState('reconnecting'); socket.onclose = () => { if (!disposed && socketRef.current === socket) { socketRef.current = null; recover(); } };
    };
    const online = () => { attemptRef.current = 0; recover(); }; const visibility = () => { if (document.visibilityState === 'visible' && (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN)) recover(); };
    window.addEventListener('online', online); document.addEventListener('visibilitychange', visibility); connect();
    return () => { disposed = true; clearTimer(); socketRef.current?.close(); socketRef.current = null; window.removeEventListener('online', online); document.removeEventListener('visibilitychange', visibility); };
  }, [bookingId, data?.booking.status, load]);

  const point = useMemo(() => data ? latest(data.tracking_points) : null, [data]);
  const serverLat = point?.latitude ?? data?.booking.last_known_latitude ?? null;
  const serverLng = point?.longitude ?? data?.booking.last_known_longitude ?? null;
  const currentLat = gpsPosition?.latitude ?? serverLat;
  const currentLng = gpsPosition?.longitude ?? serverLng;
  const statusLabel = data?.booking.status?.replace(/_/g, ' ') || 'Unknown';
  if (loading) return <div className="mx-auto flex min-h-[500px] max-w-5xl items-center justify-center"><RefreshCw className="h-8 w-8 animate-spin text-brand-500" /></div>;

  return <section className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
    <div className="mb-6 flex items-center justify-between gap-4"><button onClick={() => navigate('mover-booking-detail', bookingId ?? undefined)} className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-brand-600 dark:text-gray-300"><ArrowLeft className="h-4 w-4" /> Booking</button><div className="flex items-center gap-2"><button onClick={() => navigate('live-mover-map', bookingId ?? undefined)} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700"><Navigation className="h-4 w-4" /> Open live map</button><button onClick={() => void load(true)} disabled={refreshing} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} /> Refresh</button></div></div>
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold text-gray-900 dark:text-white">Mover journey & location</h1><p className="mt-1 text-sm text-gray-500">Booking {bookingId}</p></div><span className={cn('inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium', socketState === 'live' ? 'bg-success-50 text-success-700' : 'bg-gray-100 text-gray-700')}><Radio className="h-4 w-4" /> {socketState}</span></div>
    {error && <div className="mb-5 rounded-xl border border-error-200 bg-error-50 p-4 text-sm text-error-700">{error}</div>}
    {!data ? null : <>
      <div className="grid gap-5 md:grid-cols-2">
        <div className="rounded-2xl border bg-white p-6 shadow-sm dark:border-brand-800 dark:bg-brand-900"><div className="flex items-center gap-3"><Truck className="h-5 w-5 text-brand-500" /><h2 className="font-semibold">Journey status</h2></div><p className="mt-4 text-2xl font-bold capitalize">{statusLabel}</p><p className="mt-2 text-sm text-gray-500">Tracking number: {data.booking.tracking_number || '—'}</p><p className="mt-1 text-sm text-gray-500">Started: {data.booking.started_at ? new Date(data.booking.started_at).toLocaleString('en-KE') : '—'}</p></div>
        <div className="rounded-2xl border bg-white p-6 shadow-sm dark:border-brand-800 dark:bg-brand-900"><div className="flex items-center gap-3"><MapPin className="h-5 w-5 text-brand-500" /><h2 className="font-semibold">Current position</h2></div><p className="mt-4 text-lg font-semibold">{currentLat !== null && currentLng !== null ? `${currentLat.toFixed(6)}, ${currentLng.toFixed(6)}` : 'Waiting for GPS location'}</p><p className="mt-2 text-sm font-medium text-brand-600 dark:text-brand-300">{gpsPosition ? 'Device GPS position' : 'Django last accepted position'}</p><p className="mt-1 text-sm text-gray-500">{gpsPosition && gpsReceivedAt ? `GPS received: ${new Date(gpsReceivedAt).toLocaleString('en-KE')}` : serverLat !== null && serverLng !== null ? `Server update: ${point?.recorded_at || data.booking.last_location_at ? new Date(point?.recorded_at || data.booking.last_location_at!).toLocaleString('en-KE') : '—'}` : 'No position available yet'}</p>{gpsPosition?.accuracy != null && Number.isFinite(gpsPosition.accuracy) && <p className="mt-1 text-sm text-gray-500">GPS accuracy: {Math.round(gpsPosition.accuracy)} m</p>}{gpsPosition?.speed != null && <p className="mt-1 text-sm text-gray-500">Device speed: {Math.max(0, gpsPosition.speed * 3.6).toFixed(1)} km/h</p>}</div>
      </div>
      <div className="mt-5"><LiveLocationPrompt active={active(data.booking.status)} message="Your position is shared with the renter while the journey is live." onReady={() => requestGps()} /></div>
      <div className="mt-5 rounded-2xl border bg-white p-6 shadow-sm dark:border-brand-800 dark:bg-brand-900"><div className="flex items-center justify-between"><h2 className="font-semibold">Live location sharing</h2><Navigation className="h-5 w-5 text-brand-500" /></div><p className="mt-3 text-sm text-gray-500">Allow location access so your current position can be shared with the renter during this journey.</p><div className="mt-4 grid gap-2 text-sm text-gray-600 dark:text-gray-300"><div>Browser location API: <span className="font-medium">{'geolocation' in navigator ? 'Available' : 'Unavailable'}</span></div><div>Secure context: <span className="font-medium">{window.isSecureContext ? 'Yes' : 'No'}</span></div><div>Permission: <span className="font-medium">{gpsPermission}</span></div><div>GPS state: <span className="font-medium">{gpsState}</span></div>{gpsPosition && <div>GPS received: <span className="font-medium">{gpsPosition.latitude.toFixed(6)}, {gpsPosition.longitude.toFixed(6)}</span></div>}</div><button type="button" onClick={requestGps} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"><MapPin className="h-4 w-4" /> Enable live location</button>{gpsMessage && <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">{gpsMessage}</p>}</div>
      <div className="mt-5 rounded-2xl border bg-white p-6 shadow-sm dark:border-brand-800 dark:bg-brand-900"><div className="flex items-center justify-between"><h2 className="font-semibold">Recent GPS points</h2><Navigation className="h-5 w-5 text-brand-500" /></div>{data.tracking_points.length === 0 ? <p className="mt-4 text-sm text-gray-500">No accepted GPS points have been recorded yet. Enable live location and keep the journey active.</p> : <div className="mt-4 space-y-2">{data.tracking_points.slice(0, 10).map(item => <div key={item.id} className="flex flex-wrap justify-between gap-2 rounded-lg bg-gray-50 p-3 text-sm dark:bg-brand-950"><span>{item.latitude.toFixed(6)}, {item.longitude.toFixed(6)}</span><span className="text-gray-500">{new Date(item.recorded_at).toLocaleString('en-KE')}</span></div>)}</div>}</div>
    </>}
  </section>;
}
