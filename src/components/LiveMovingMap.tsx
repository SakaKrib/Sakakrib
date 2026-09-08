import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FullscreenControl,
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  Popup,
  setWorkerUrl,
} from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { ArrowLeft, CheckCircle2, Crosshair, Loader2, Navigation, Radio, Route, Truck } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import { moverApi, type MoverBooking, type MoverTrackingPoint, type MoverTrackingResponse } from '@/lib/Movers/moverApi';
import { renterApi } from '@/lib/Renter/renterApi';
import { cn } from '@/lib/utils';

setWorkerUrl(maplibreWorkerUrl);

type TrackingPoint = MoverTrackingPoint;
type SocketState = 'connecting' | 'live' | 'reconnecting' | 'offline' | 'closed';
type JourneyPhase = 'HEADING_TO_PICKUP' | 'IN_TRANSIT' | null;
type Coordinate = [number, number];

interface MapBooking extends MoverBooking {
  pickup_latitude: number | null;
  pickup_longitude: number | null;
  dropoff_latitude: number | null;
  dropoff_longitude: number | null;
}

interface OsrmRouteResponse {
  code: string;
  routes?: Array<{ geometry?: { coordinates?: Coordinate[] }; distance?: number; duration?: number }>;
}

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const ROUTING_URL = 'https://router.project-osrm.org/route/v1/driving';
const ROUTE_REFRESH_METERS = 500;

const active = (value: string | null | undefined) =>
  String(value ?? '').trim().toLowerCase().replace(/-/g, '_') === 'in_progress';

function socketUrl(bookingId: string) {
  const configured = (import.meta.env.VITE_DJANGO_API_URL as string | undefined)?.replace(/\/+$/, '');
  const url = new URL(configured || window.location.origin, window.location.origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = `/ws/tracking/${encodeURIComponent(bookingId)}/`;
  url.search = '';
  return url.toString();
}

function validCoordinate(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value);
}

function routeUrl(from: Coordinate, to: Coordinate) {
  return `${ROUTING_URL}/${from[0]},${from[1]};${to[0]},${to[1]}?overview=full&geometries=geojson&steps=false`;
}

function markerElement(label: string, color: string, icon: string) {
  const element = document.createElement('div');
  element.setAttribute('role', 'img');
  element.setAttribute('aria-label', label);
  element.title = label;
  element.style.width = '38px';
  element.style.height = '38px';
  element.style.borderRadius = '50%';
  element.style.background = color;
  element.style.border = '4px solid white';
  element.style.boxShadow = '0 3px 12px rgba(0,0,0,.35)';
  element.style.display = 'flex';
  element.style.alignItems = 'center';
  element.style.justifyContent = 'center';
  element.style.fontSize = '18px';
  element.textContent = icon;
  return element;
}

function distanceMeters(a: Coordinate, b: Coordinate) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const value = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return earthRadius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function coordinateLabel(coordinate: Coordinate | null) {
  if (!coordinate) return 'Unavailable';
  return `${coordinate[1].toFixed(6)}, ${coordinate[0].toFixed(6)}`;
}

export default function LiveMovingMap() {
  const { profile } = useAuth();
  const { selectedMoverBookingId, selectedMoverId, navigate } = useNav();
  const isMover = profile?.role === 'mover';
  const bookingId = isMover ? selectedMoverBookingId : selectedMoverId;

  const [booking, setBooking] = useState<MapBooking | null>(null);
  const [points, setPoints] = useState<TrackingPoint[]>([]);
  const [journeyPhase, setJourneyPhase] = useState<JourneyPhase>(null);
  const [socketState, setSocketState] = useState<SocketState>('closed');
  const [loading, setLoading] = useState(false);
  const [mapLoading, setMapLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [roadRoute, setRoadRoute] = useState<Coordinate[]>([]);
  const [routeDistanceKm, setRouteDistanceKm] = useState<number | null>(null);
  const [routeDurationMinutes, setRouteDurationMinutes] = useState<number | null>(null);
  const [followMover, setFollowMover] = useState(true);

  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const moverMarkerRef = useRef<Marker | null>(null);
  const pickupMarkerRef = useRef<Marker | null>(null);
  const dropoffMarkerRef = useRef<Marker | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const reconnectRef = useRef<number | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const attemptRef = useRef(0);
  const firstMapFitRef = useRef(false);
  const routeRequestRef = useRef(0);
  const routeOriginRef = useRef<Coordinate | null>(null);
  const pickupMarkerPhaseRef = useRef<JourneyPhase>(null);

  useEffect(() => {
    console.log('[LiveMovingMap] component mounted', { profileRole: profile?.role, isMover, selectedMoverBookingId, selectedMoverId, bookingId, mapStyle: MAP_STYLE });
    return () => console.log('[LiveMovingMap] component unmounted');
  }, []);

  const load = useCallback(async () => {
    console.log('[LiveMovingMap] load started', { bookingId, isMover });
    if (!bookingId) {
      setLoading(false);
      return null;
    }
    try {
      const [tracking, selectedBooking] = isMover
        ? await Promise.all([moverApi.getTracking(bookingId), moverApi.getBooking(bookingId)])
        : await Promise.all([renterApi.getTracking(bookingId), renterApi.getBooking(bookingId)]);

      const trackingData = tracking as MoverTrackingResponse;
      const bookingData = selectedBooking as MapBooking;
      setBooking({ ...bookingData, ...(trackingData.booking as Partial<MapBooking>) });
      setPoints(trackingData.tracking_points ?? []);

      // The journey phase endpoint is authoritative when available, but a temporary
      // 404 must not prevent the live map itself from loading. A new journey starts
      // in HEADING_TO_PICKUP, and the tracking WebSocket sends the authoritative
      // phase in its ready/phase messages as soon as the socket connects.
      const phaseApi = isMover ? moverApi.getJourneyPhase : renterApi.getJourneyPhase;
      try {
        const phaseData = await phaseApi(bookingId);
        setJourneyPhase(
          phaseData.phase === 'HEADING_TO_PICKUP' || phaseData.phase === 'IN_TRANSIT'
            ? phaseData.phase
            : null,
        );
        setError(null);
        return { tracking: trackingData, phase: phaseData };
      } catch (phaseError) {
        console.warn('[LiveMovingMap] journey phase endpoint unavailable; continuing with WebSocket phase', phaseError);
        setJourneyPhase('HEADING_TO_PICKUP');
        setError(null);
        return { tracking: trackingData, phase: null };
      }
    } catch (err) {
      console.error('[LiveMovingMap] load failed', err);
      setError(err instanceof Error ? err.message : 'Unable to load live map.');
      return null;
    } finally {
      setLoading(false);
    }
  }, [bookingId, isMover]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) return;
    try {
      const map = new MapLibreMap({ container: mapElementRef.current, style: MAP_STYLE, center: [36.817223, -1.286389], zoom: 12, attributionControl: {}, cooperativeGestures: false });
      map.addControl(new NavigationControl({ showCompass: true }), 'top-right');
      map.addControl(new FullscreenControl(), 'top-right');
      map.on('style.load', () => setMapReady(true));
      map.on('load', () => { setMapReady(true); setMapLoading(false); });
      map.on('error', event => { if (event.error) { console.error('[LiveMovingMap] MapLibre error event', event.error); setMapError(event.error.message || 'Unable to load the map.'); setMapLoading(false); } });
      mapRef.current = map;
    } catch (err) {
      console.error('[LiveMovingMap] MapLibre initialization threw', err);
      setMapLoading(false);
      setMapError(err instanceof Error ? err.message : 'Unable to initialize MapLibre.');
    }
    return () => {
      popupRef.current?.remove();
      moverMarkerRef.current?.remove();
      pickupMarkerRef.current?.remove();
      dropoffMarkerRef.current?.remove();
      mapRef.current?.remove();
      popupRef.current = null;
      moverMarkerRef.current = null;
      pickupMarkerRef.current = null;
      dropoffMarkerRef.current = null;
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!bookingId || !booking || !active(booking.status)) {
      socketRef.current?.close();
      socketRef.current = null;
      if (reconnectRef.current !== null) window.clearTimeout(reconnectRef.current);
      reconnectRef.current = null;
      setSocketState('closed');
      return;
    }
    let disposed = false;
    const clearTimer = () => { if (reconnectRef.current !== null) window.clearTimeout(reconnectRef.current); reconnectRef.current = null; };
    const schedule = () => {
      if (disposed || !navigator.onLine) { setSocketState('offline'); return; }
      clearTimer();
      setSocketState('reconnecting');
      const delay = Math.min(15000, 750 * Math.pow(2, Math.min(attemptRef.current++, 4)));
      reconnectRef.current = window.setTimeout(connect, delay);
    };
    const connect = () => {
      if (disposed) return;
      clearTimer();
      const url = socketUrl(bookingId);
      socketRef.current?.close();
      setSocketState(attemptRef.current ? 'reconnecting' : 'connecting');
      let socket: WebSocket;
      try { socket = new WebSocket(url); } catch { schedule(); return; }
      socketRef.current = socket;
      socket.onopen = () => { if (socketRef.current !== socket) return; attemptRef.current = 0; setSocketState('live'); };
      socket.onmessage = event => {
        if (socketRef.current !== socket) return;
        try {
          const message = JSON.parse(event.data) as { type?: string; location?: TrackingPoint | null; phase?: string };
          if (message.type === 'phase') {
            if (message.phase === 'HEADING_TO_PICKUP' || message.phase === 'IN_TRANSIT') setJourneyPhase(message.phase);
            return;
          }
          const point = message.location;
          if (!point || (message.type !== 'location' && message.type !== 'ready')) return;
          setPoints(previous => previous.some(item => item.id === point.id) ? previous : [point, ...previous].sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime()).slice(0, 200));
          setBooking(previous => previous ? { ...previous, last_known_latitude: point.latitude, last_known_longitude: point.longitude, last_location_at: point.recorded_at } : previous);
          if (message.type === 'ready' && (message.phase === 'HEADING_TO_PICKUP' || message.phase === 'IN_TRANSIT')) setJourneyPhase(message.phase);
        } catch (err) { console.error('[LiveMovingMap] malformed websocket frame', err); }
      };
      socket.onerror = () => { if (socketRef.current === socket) setSocketState('reconnecting'); };
      socket.onclose = () => {
        if (!disposed && socketRef.current === socket) {
          socketRef.current = null;
          void load().then(snapshot => { if (snapshot && active(snapshot.tracking.booking.status)) schedule(); });
        }
      };
    };
    const recover = () => { attemptRef.current = 0; void load().then(snapshot => { if (snapshot && active(snapshot.tracking.booking.status)) connect(); }); };
    const online = () => recover();
    const offline = () => setSocketState('offline');
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    connect();
    return () => { disposed = true; clearTimer(); socketRef.current?.close(); socketRef.current = null; window.removeEventListener('online', online); window.removeEventListener('offline', offline); };
  }, [bookingId, booking?.status, load]);

  const latest = useMemo(() => [...points].sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime())[0] ?? null, [points]);
  const path = useMemo(() => [...points].sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()).slice(-200).map(point => [point.longitude, point.latitude] as Coordinate), [points]);
  const pickup = useMemo<Coordinate | null>(() => booking && validCoordinate(booking.pickup_latitude) && validCoordinate(booking.pickup_longitude) ? [booking.pickup_longitude!, booking.pickup_latitude!] : null, [booking]);
  const dropoff = useMemo<Coordinate | null>(() => booking && validCoordinate(booking.dropoff_latitude) && validCoordinate(booking.dropoff_longitude) ? [booking.dropoff_longitude!, booking.dropoff_latitude!] : null, [booking]);
  const currentPosition = useMemo<Coordinate | null>(() => {
    if (latest) return [latest.longitude, latest.latitude];
    if (booking && validCoordinate(booking.last_known_latitude) && validCoordinate(booking.last_known_longitude)) return [booking.last_known_longitude!, booking.last_known_latitude!];
    return null;
  }, [booking, latest]);
  const activeTarget = journeyPhase === 'IN_TRANSIT' ? dropoff : pickup;
  const phaseTitle = isMover
    ? journeyPhase === 'IN_TRANSIT'
      ? 'Pickup confirmed — head to destination'
      : journeyPhase === 'HEADING_TO_PICKUP'
        ? 'Head to pickup point'
        : 'Live journey map'
    : journeyPhase === 'IN_TRANSIT'
      ? 'Items collected — heading to destination'
      : journeyPhase === 'HEADING_TO_PICKUP'
        ? 'Mover heading to pickup'
        : 'Live mover location';
  const phaseDescription = isMover
    ? journeyPhase === 'IN_TRANSIT'
      ? 'Pickup is confirmed. Proceed to the destination shown on the map.'
      : journeyPhase === 'HEADING_TO_PICKUP'
        ? 'Proceed to pickup point A and collect the items. Your current position and the pickup route are shown live.'
        : 'Waiting for the journey phase and live GPS position.'
    : journeyPhase === 'IN_TRANSIT'
      ? 'Pickup is confirmed. The mover is now travelling with the items to the destination.'
      : journeyPhase === 'HEADING_TO_PICKUP'
        ? 'The mover is travelling to the pickup location. Pickup has not been confirmed yet.'
        : 'Waiting for the journey phase and live GPS position.';

  useEffect(() => {
    if (!currentPosition || !activeTarget) {
      if (!activeTarget) setRouteError(null);
      return;
    }
    const previousOrigin = routeOriginRef.current;
    if (previousOrigin && roadRoute.length >= 2 && distanceMeters(previousOrigin, currentPosition) < ROUTE_REFRESH_METERS) return;
    const requestId = ++routeRequestRef.current;
    const controller = new AbortController();
    routeOriginRef.current = currentPosition;
    setRouteError(null);
    setRoadRoute([]);
    fetch(routeUrl(currentPosition, activeTarget), { signal: controller.signal, headers: { Accept: 'application/json' } })
      .then(async response => {
        if (!response.ok) throw new Error(`Routing service returned HTTP ${response.status}.`);
        return response.json() as Promise<OsrmRouteResponse>;
      })
      .then(data => {
        if (requestId !== routeRequestRef.current) return;
        const route = data.routes?.[0];
        const coordinates = route?.geometry?.coordinates ?? [];
        if (data.code !== 'Ok' || coordinates.length < 2) throw new Error('No drivable road route was found to the current destination.');
        setRoadRoute(coordinates);
        setRouteDistanceKm(typeof route?.distance === 'number' ? route.distance / 1000 : null);
        setRouteDurationMinutes(typeof route?.duration === 'number' ? route.duration / 60 : null);
      })
      .catch(err => {
        if (controller.signal.aborted || requestId !== routeRequestRef.current) return;
        console.error('[LiveMovingMap] road route failed', err);
        setRoadRoute([]);
        setRouteDistanceKm(null);
        setRouteDurationMinutes(null);
        setRouteError(err instanceof Error ? err.message : 'Unable to calculate the road route.');
      });
    return () => controller.abort();
  }, [activeTarget, currentPosition, journeyPhase, roadRoute.length]);

  useEffect(() => {
    routeOriginRef.current = null;
    setRoadRoute([]);
    setRouteDistanceKm(null);
    setRouteDurationMinutes(null);
    setRouteError(null);
  }, [journeyPhase, bookingId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !booking || !map.isStyleLoaded()) return;

    const setLine = (id: string, sourceId: string, coordinates: Coordinate[], paint: Record<string, unknown>) => {
      const data = { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates } };
      const existing = map.getSource(sourceId) as import('maplibre-gl').GeoJSONSource | undefined;
      if (existing) existing.setData(data);
      else { map.addSource(sourceId, { type: 'geojson', data }); map.addLayer({ id, type: 'line', source: sourceId, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint }); }
    };

    if (pickup) {
      const pickupPhase = journeyPhase === 'IN_TRANSIT' ? 'IN_TRANSIT' : 'HEADING_TO_PICKUP';
      if (!pickupMarkerRef.current || pickupMarkerPhaseRef.current !== pickupPhase) {
        pickupMarkerRef.current?.remove();
        const pickupLabel = isMover ? 'Pickup point A' : 'Pickup location';
        const element = pickupPhase === 'IN_TRANSIT' ? markerElement(isMover ? 'Pickup point A — collected' : 'Pickup location — collected', '#16a34a', '✓') : markerElement(pickupLabel, '#2563eb', 'A');
        pickupMarkerRef.current = new Marker({ element }).setLngLat(pickup).setPopup(new Popup({ offset: 22 }).setHTML(pickupPhase === 'IN_TRANSIT' ? '<strong>Pickup confirmed</strong><br/>Items collected' : isMover ? '<strong>Pickup point A</strong><br/>Proceed here to collect the items' : '<strong>Pickup location</strong>')).addTo(map);
        pickupMarkerPhaseRef.current = pickupPhase;
      } else pickupMarkerRef.current.setLngLat(pickup);
    }
    if (dropoff) {
      const element = markerElement(isMover ? 'Destination B' : 'Destination', '#dc2626', 'B');
      if (!dropoffMarkerRef.current) dropoffMarkerRef.current = new Marker({ element }).setLngLat(dropoff).setPopup(new Popup({ offset: 22 }).setHTML(isMover ? '<strong>Destination B</strong><br/>Proceed here after pickup' : '<strong>Destination</strong>')).addTo(map);
      else dropoffMarkerRef.current.setLngLat(dropoff);
    }

    if (roadRoute.length >= 2) setLine('active-road-route-line', 'active-road-route', roadRoute, { 'line-color': '#2563eb', 'line-width': 7, 'line-opacity': 0.9 });
    if (path.length >= 2) setLine('mover-travelled-path-line', 'mover-travelled-path', path, { 'line-color': '#60a5fa', 'line-width': 4, 'line-opacity': 0.9, 'line-dasharray': [1, 0] });

    if (latest) {
      const position: Coordinate = [latest.longitude, latest.latitude];
      if (!moverMarkerRef.current) {
        const element = markerElement(isMover ? 'Your current location' : 'Mover current location', '#111827', '🚚');
        moverMarkerRef.current = new Marker({ element }).setLngLat(position).addTo(map);
        element.addEventListener('click', () => {
          popupRef.current?.remove();
          popupRef.current = new Popup({ offset: 28 }).setLngLat(position).setHTML(`<strong>${isMover ? 'Your current location' : 'Live mover location'}</strong><br/>Latitude: ${latest.latitude.toFixed(6)}<br/>Longitude: ${latest.longitude.toFixed(6)}<br/>${new Date(latest.recorded_at).toLocaleTimeString('en-KE')}${latest.speed_kph != null ? `<br/>Speed: ${latest.speed_kph.toFixed(1)} km/h` : ''}`).addTo(map);
        });
      } else moverMarkerRef.current.setLngLat(position);

      if (!firstMapFitRef.current) {
        const bounds = new LngLatBounds(position, position);
        if (pickup) bounds.extend(pickup);
        if (dropoff) bounds.extend(dropoff);
        if (roadRoute.length >= 2) roadRoute.forEach(coordinate => bounds.extend(coordinate));
        map.fitBounds(bounds, { padding: 100, maxZoom: 15, duration: 600 });
        firstMapFitRef.current = true;
      } else if (followMover) map.easeTo({ center: position, duration: 500 });
    } else if (!firstMapFitRef.current && roadRoute.length >= 2) {
      const bounds = new LngLatBounds(roadRoute[0], roadRoute[0]);
      roadRoute.forEach(coordinate => bounds.extend(coordinate));
      map.fitBounds(bounds, { padding: 100, maxZoom: 15, duration: 600 });
      firstMapFitRef.current = true;
    }
  }, [booking, dropoff, followMover, isMover, journeyPhase, latest, mapReady, path, pickup, roadRoute]);

  useEffect(() => {
    firstMapFitRef.current = false;
    pickupMarkerPhaseRef.current = null;
    setJourneyPhase(null);
    setRoadRoute([]);
    setRouteError(null);
    setRouteDistanceKm(null);
    setRouteDurationMinutes(null);
  }, [bookingId]);

  if (!bookingId) return null;
  if (loading) return <div className="flex min-h-screen items-center justify-center bg-gray-950 text-white"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  if (error && !booking) return <div className="flex min-h-screen items-center justify-center bg-gray-950 p-6 text-white"><div className="max-w-lg rounded-2xl bg-brand-900 p-6 text-center"><p className="text-sm text-error-300">{error}</p><button type="button" onClick={() => navigate('mover-booking-detail', bookingId)} className="mt-5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold">Back to booking</button></div></div>;

  const lat = currentPosition?.[1] ?? null;
  const lng = currentPosition?.[0] ?? null;
  const lastUpdated = latest?.recorded_at ?? booking?.last_location_at ?? null;
  const routeStatus = routeError ? routeError : roadRoute.length >= 2 ? `Road route to ${journeyPhase === 'IN_TRANSIT' ? 'destination' : 'pickup'} active` : currentPosition ? 'Calculating road route…' : 'Waiting for mover GPS…';

  return <div className="fixed inset-0 z-[70] flex flex-col bg-gray-950 text-white">
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 p-3 sm:p-5">
      <div className="pointer-events-auto flex items-center gap-2 rounded-2xl bg-gray-950/85 p-2 shadow-xl backdrop-blur-md">
        <button type="button" onClick={() => navigate(isMover ? 'mover-booking-detail' : 'mover-tracking', bookingId)} aria-label="Back to tracking" className="inline-flex h-10 w-10 items-center justify-center rounded-xl hover:bg-white/10"><ArrowLeft className="h-5 w-5" /></button>
        <div className="pr-2"><p className="text-sm font-bold">{isMover ? 'Move navigation' : 'Live moving map'}</p><p className="text-[11px] text-gray-300">Booking {bookingId.slice(0, 8)}…</p></div>
      </div>
      <div className="pointer-events-auto flex items-center gap-2 rounded-2xl bg-gray-950/85 px-3 py-2 shadow-xl backdrop-blur-md"><Radio className="h-4 w-4" /><span className={cn('text-xs font-semibold', socketState === 'live' ? 'text-green-300' : 'text-gray-200')}>{socketState === 'live' ? 'LIVE' : socketState.toUpperCase()}</span></div>
    </div>

    <div ref={mapElementRef} className="min-h-0 flex-1 bg-gray-900" aria-label={isMover ? 'Live mover navigation map' : 'MapLibre live mover tracking map'} />

    {(mapLoading || mapError) && <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-950/80 p-6 backdrop-blur-sm"><div className="max-w-md rounded-2xl bg-brand-900 p-6 text-center shadow-2xl">{mapLoading ? <><Loader2 className="mx-auto h-8 w-8 animate-spin" /><p className="mt-3 font-semibold">Loading live map…</p></> : <><p className="text-sm font-semibold">Map is not available</p><p className="mt-2 text-sm text-gray-300">{mapError}</p></>}</div></div>}

    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 p-3 sm:p-5">
      <div className="mx-auto flex max-w-6xl flex-col gap-3">
        <div className="pointer-events-auto rounded-2xl bg-gray-950/90 p-4 shadow-2xl backdrop-blur-md">
          <div className="flex items-start gap-3">
            {journeyPhase === 'IN_TRANSIT' ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-400" /> : <Navigation className="mt-0.5 h-5 w-5 shrink-0 text-blue-400" />}
            <div className="min-w-0"><p className="text-sm font-bold">{phaseTitle}</p><p className="mt-1 text-xs leading-5 text-gray-300">{phaseDescription}</p></div>
          </div>
        </div>
        <div className="pointer-events-auto flex flex-wrap items-center gap-2 self-end rounded-2xl bg-gray-950/90 p-2 shadow-xl backdrop-blur-md">
          <button type="button" onClick={() => { setFollowMover(true); if (latest) mapRef.current?.easeTo({ center: [latest.longitude, latest.latitude], duration: 500 }); }} className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold hover:bg-white/10"><Crosshair className="h-4 w-4" /> {isMover ? 'Center on my location' : 'Follow mover'}</button>
          <button type="button" onClick={() => setFollowMover(value => !value)} className={cn('inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold', followMover ? 'bg-white/15' : 'hover:bg-white/10')}><Route className="h-4 w-4" /> {isMover ? (followMover ? 'Follow route' : 'Explore map') : (followMover ? 'Following' : 'Explore map')}</button>
        </div>
        {isMover ? (
          <div className="pointer-events-auto grid gap-3 rounded-2xl bg-gray-950/90 p-4 shadow-2xl sm:grid-cols-3">
            <div className="min-w-0"><p className="text-[11px] uppercase tracking-wide text-gray-400">Current objective</p><p className="mt-1 text-sm font-bold">{journeyPhase === 'IN_TRANSIT' ? 'Destination B' : 'Pickup point A'}</p><p className="mt-1 text-[11px] text-gray-400">{routeDistanceKm != null ? `${routeDistanceKm.toFixed(1)} km remaining` : routeStatus}</p><p className="mt-1 text-[11px] text-gray-400">{routeDurationMinutes != null ? `Approx. ${Math.round(routeDurationMinutes)} min` : ''}</p></div>
            <div className="min-w-0"><p className="text-[11px] uppercase tracking-wide text-gray-400">Your current position</p><p className="mt-1 truncate text-sm font-bold">{lat !== null && lng !== null ? `Lat ${lat.toFixed(6)} · Lng ${lng.toFixed(6)}` : 'Waiting for GPS…'}</p><p className="mt-1 text-[11px] text-gray-400">{lastUpdated ? `Updated ${new Date(lastUpdated).toLocaleTimeString('en-KE')}` : 'No accepted GPS point yet'}</p></div>
            <div className="min-w-0"><p className="text-[11px] uppercase tracking-wide text-gray-400">Journey</p><p className="mt-1 flex items-center gap-2 text-sm font-bold"><Truck className="h-4 w-4" /> {journeyPhase === 'IN_TRANSIT' ? 'Pickup confirmed' : journeyPhase === 'HEADING_TO_PICKUP' ? 'Heading to pickup' : 'Starting'}</p><p className="mt-1 text-[11px] text-gray-400">{points.length} GPS points received</p></div>
            <div className="min-w-0"><p className="text-[11px] uppercase tracking-wide text-gray-400">Pickup point A</p><p className="mt-1 text-sm font-bold">{coordinateLabel(pickup)}</p><p className="mt-1 text-[11px] text-gray-400">{journeyPhase === 'IN_TRANSIT' ? 'Collected' : 'Collect items here'}</p></div>
            <div className="min-w-0"><p className="text-[11px] uppercase tracking-wide text-gray-400">Destination B</p><p className="mt-1 text-sm font-bold">{coordinateLabel(dropoff)}</p><p className="mt-1 text-[11px] text-gray-400">{journeyPhase === 'IN_TRANSIT' ? 'Active route' : 'Next after pickup'}</p></div>
            <div className="min-w-0"><p className="text-[11px] uppercase tracking-wide text-gray-400">Movement</p><p className="mt-1 text-sm font-bold">{latest?.speed_kph != null ? `${latest.speed_kph.toFixed(1)} km/h` : 'Speed unavailable'}</p><p className="mt-1 text-[11px] text-gray-400">Your device location is shared live.</p></div>
          </div>
        ) : (
          <div className="pointer-events-auto grid gap-3 rounded-2xl bg-gray-950/90 p-4 shadow-2xl sm:grid-cols-4">
            <div className="min-w-0"><p className="text-[11px] uppercase tracking-wide text-gray-400">Next destination</p><p className="mt-1 text-sm font-bold">{journeyPhase === 'IN_TRANSIT' ? 'Delivery destination' : 'Pickup location'}</p><p className="mt-1 text-[11px] text-gray-400">{routeDistanceKm != null ? `${routeDistanceKm.toFixed(1)} km remaining` : routeStatus}</p><p className="mt-1 text-[11px] text-gray-400">{routeDurationMinutes != null ? `Approx. ${Math.round(routeDurationMinutes)} min` : ''}</p></div>
            <div className="min-w-0"><p className="text-[11px] uppercase tracking-wide text-gray-400">Mover position</p><p className="mt-1 truncate text-sm font-bold">{lat !== null && lng !== null ? `${lat.toFixed(6)}, ${lng.toFixed(6)}` : 'Waiting for GPS…'}</p><p className="mt-1 text-[11px] text-gray-400">{lastUpdated ? `Updated ${new Date(lastUpdated).toLocaleTimeString('en-KE')}` : 'No accepted GPS point yet'}</p></div>
            <div className="min-w-0"><p className="text-[11px] uppercase tracking-wide text-gray-400">Journey phase</p><p className="mt-1 flex items-center gap-2 text-sm font-bold"><Truck className="h-4 w-4" /> {journeyPhase === 'IN_TRANSIT' ? 'Items collected' : journeyPhase === 'HEADING_TO_PICKUP' ? 'Heading to pickup' : 'Starting'}</p><p className="mt-1 text-[11px] text-gray-400">{points.length} GPS points received</p></div>
            <div className="min-w-0"><p className="text-[11px] uppercase tracking-wide text-gray-400">Movement</p><p className="mt-1 text-sm font-bold">{latest?.speed_kph != null ? `${latest.speed_kph.toFixed(1)} km/h` : 'Speed unavailable'}</p><p className="mt-1 text-[11px] text-gray-400">Mover location is updated live.</p></div>
          </div>
        )}
      </div>
    </div>
  </div>;
}
