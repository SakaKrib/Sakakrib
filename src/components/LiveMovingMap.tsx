import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FullscreenControl, LngLatBounds, Map as MapLibreMap, Marker, NavigationControl, Popup, setWorkerUrl } from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { ArrowLeft, CheckCircle2, ChevronDown, ChevronUp, Crosshair, Loader2, MapPinned, Navigation, PackageCheck, Radio, Route, ShieldCheck, Truck } from 'lucide-react';
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
type DeviceGpsPosition = { latitude: number; longitude: number; accuracy_meters: number | null; speed_kph: number | null; heading_degrees: number | null; timestamp?: number; bookingId?: string };
type LocationPermissionState = 'checking' | 'granted' | 'prompt' | 'denied' | 'unsupported';
type TrackingHealthStatus = 'HEALTHY' | 'STARTING' | 'STALE' | 'OFFLINE' | string;

interface TrackingHealth { status: TrackingHealthStatus; is_live: boolean; age_seconds: number | null; recent_point_count: number; }
interface MapBooking extends MoverBooking { pickup_latitude: number | null; pickup_longitude: number | null; dropoff_latitude: number | null; dropoff_longitude: number | null; tracking_health?: TrackingHealth | null; }
interface OsrmRouteResponse { code: string; routes?: Array<{ geometry?: { coordinates?: Coordinate[] }; distance?: number; duration?: number }> }
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const ROUTING_URL = 'https://router.project-osrm.org/route/v1/driving';
const ROUTE_REFRESH_METERS = 500;
const PICKUP_CONFIRMATION_RADIUS_METERS = 250;
const GPS_FRESHNESS_MS = 2 * 60 * 1000;
const active = (value: string | null | undefined) => String(value ?? '').trim().toLowerCase().replace(/-/g, '_') === 'in_progress';
function socketUrl(bookingId: string) { const url = new URL(window.location.origin); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'; url.pathname = `/ws/tracking/${encodeURIComponent(bookingId)}/`; url.search = ''; return url.toString(); }
function validCoordinate(value: number | null | undefined) { return typeof value === 'number' && Number.isFinite(value); }
function routeUrl(from: Coordinate, to: Coordinate) { return `${ROUTING_URL}/${from[0]},${from[1]};${to[0]},${to[1]}?overview=full&geometries=geojson&steps=false`; }
function markerElement(label: string, color: string, icon: string) { const element = document.createElement('div'); element.setAttribute('role', 'img'); element.setAttribute('aria-label', label); element.title = label; element.style.width = '38px'; element.style.height = '38px'; element.style.borderRadius = '50%'; element.style.background = color; element.style.border = '4px solid white'; element.style.boxShadow = '0 3px 12px rgba(0,0,0,.35)'; element.style.display = 'flex'; element.style.alignItems = 'center'; element.style.justifyContent = 'center'; element.style.fontSize = '18px'; element.textContent = icon; return element; }
function distanceMeters(a: Coordinate, b: Coordinate) { const toRad = (value: number) => (value * Math.PI) / 180; const earthRadius = 6371000; const dLat = toRad(b[1] - a[1]); const dLng = toRad(b[0] - a[0]); const lat1 = toRad(a[1]); const lat2 = toRad(b[1]); const sinLat = Math.sin(dLat / 2); const sinLng = Math.sin(dLng / 2); const value = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng; return earthRadius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value)); }
function coordinateLabel(coordinate: Coordinate | null) { if (!coordinate) return 'Unavailable'; return `${coordinate[1].toFixed(6)}, ${coordinate[0].toFixed(6)}`; }

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
  const [pickupConfirmationError, setPickupConfirmationError] = useState<string | null>(null);
  const [confirmingPickup, setConfirmingPickup] = useState(false);
  const [roadRoute, setRoadRoute] = useState<Coordinate[]>([]);
  const [routeDistanceKm, setRouteDistanceKm] = useState<number | null>(null);
  const [routeDurationMinutes, setRouteDurationMinutes] = useState<number | null>(null);
  const [followMover, setFollowMover] = useState(true);
  const [deviceGps, setDeviceGps] = useState<DeviceGpsPosition | null>(null);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [locationPermission, setLocationPermission] = useState<LocationPermissionState>('checking');
  const [locationError, setLocationError] = useState<string | null>(null);
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

  const load = useCallback(async () => {
    if (!bookingId) { setLoading(false); return null; }
    try {
      const [tracking, selectedBooking] = isMover ? await Promise.all([moverApi.getTracking(bookingId), moverApi.getBooking(bookingId)]) : await Promise.all([renterApi.getTracking(bookingId), renterApi.getBooking(bookingId)]);
      const trackingData = tracking as MoverTrackingResponse;
      const bookingData = selectedBooking as MapBooking;
      setBooking({ ...bookingData, ...(trackingData.booking as Partial<MapBooking>) });
      setPoints(trackingData.tracking_points ?? []);
      const phaseApi = isMover ? moverApi.getJourneyPhase : renterApi.getJourneyPhase;
      try {
        const phaseData = await phaseApi(bookingId);
        setJourneyPhase(phaseData.phase === 'HEADING_TO_PICKUP' || phaseData.phase === 'IN_TRANSIT' ? phaseData.phase : null);
        setError(null);
        return { tracking: trackingData, phase: phaseData };
      } catch {
        setJourneyPhase('HEADING_TO_PICKUP');
        setError(null);
        return { tracking: trackingData, phase: null };
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to load live map.'); return null; }
    finally { setLoading(false); }
  }, [bookingId, isMover]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!isMover || !bookingId || !active(booking?.status)) return;
    window.dispatchEvent(new Event('sakakrib:request-mover-gps'));
  }, [booking?.status, bookingId, isMover]);

  useEffect(() => {
    if (!isMover) { setDeviceGps(null); return; }
    const handleDeviceGps = (event: Event) => {
      const detail = (event as CustomEvent<DeviceGpsPosition>).detail;
      if (!detail || !Number.isFinite(detail.latitude) || !Number.isFinite(detail.longitude)) return;
      if (detail.bookingId && bookingId && detail.bookingId !== bookingId) return;
      setDeviceGps(detail);
    };
    window.addEventListener('sakakrib:mover-gps-position', handleDeviceGps);
    return () => window.removeEventListener('sakakrib:mover-gps-position', handleDeviceGps);
  }, [bookingId, isMover]);

  useEffect(() => {
    if (!isMover) { setLocationPermission('unsupported'); setLocationError(null); return; }
    if (!window.isSecureContext) {
      setLocationPermission('denied');
      setLocationError('This page is using HTTP. Live location requires HTTPS on your phone. Open SakaKrib using an HTTPS address.');
      return;
    }
    if (!('geolocation' in navigator)) { setLocationPermission('unsupported'); setLocationError('This browser does not provide device location.'); return; }
    let disposed = false;
    let permissionStatus: PermissionStatus | null = null;
    const handlePermissionChange = () => {
      if (!disposed && permissionStatus) setLocationPermission(permissionStatus.state as LocationPermissionState);
    };
    const refresh = async () => {
      try {
        if (!navigator.permissions?.query) { if (!disposed) setLocationPermission('prompt'); return; }
        permissionStatus = await navigator.permissions.query({ name: 'geolocation' });
        if (!disposed) setLocationPermission(permissionStatus.state as LocationPermissionState);
        permissionStatus.addEventListener('change', handlePermissionChange);
      } catch { if (!disposed) setLocationPermission('prompt'); }
    };
    void refresh();
    return () => { disposed = true; permissionStatus?.removeEventListener('change', handlePermissionChange); };
  }, [isMover]);

  const requestLocation = useCallback(() => {
    if (!isMover) return;
    setLocationError(null);
    if (!window.isSecureContext) {
      setLocationPermission('denied');
      setLocationError('This page is using HTTP. The browser will not allow device location here. Open SakaKrib over HTTPS on your phone.');
      return;
    }
    if (!('geolocation' in navigator)) { setLocationPermission('unsupported'); setLocationError('Your browser does not support device location.'); return; }
    navigator.geolocation.getCurrentPosition(
      () => { setLocationPermission('granted'); window.dispatchEvent(new Event('sakakrib:request-mover-gps')); },
      (error) => {
        if (error.code === 1) { setLocationPermission('denied'); setLocationError('Location permission is blocked for this site. Change the site location permission in your browser, then return here and try again.'); }
        else setLocationError(error.message || 'Unable to obtain your current location. Check the phone Location setting and try again.');
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 60000 },
    );
  }, [isMover]);

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) return;
    try {
      const map = new MapLibreMap({ container: mapElementRef.current, style: MAP_STYLE, center: [36.817223, -1.286389], zoom: 12, attributionControl: {}, cooperativeGestures: false });
      map.addControl(new NavigationControl({ showCompass: true }), 'top-right');
      map.addControl(new FullscreenControl(), 'top-right');
      map.on('style.load', () => setMapReady(true));
      map.on('load', () => { setMapReady(true); setMapLoading(false); });
      map.on('error', event => { if (event.error) { setMapError(event.error.message || 'Unable to load the map.'); setMapLoading(false); } });
      mapRef.current = map;
    } catch (err) { setMapLoading(false); setMapError(err instanceof Error ? err.message : 'Unable to initialize MapLibre.'); }
    return () => { popupRef.current?.remove(); moverMarkerRef.current?.remove(); pickupMarkerRef.current?.remove(); dropoffMarkerRef.current?.remove(); mapRef.current?.remove(); popupRef.current = null; moverMarkerRef.current = null; pickupMarkerRef.current = null; dropoffMarkerRef.current = null; mapRef.current = null; };
  }, []);

  useEffect(() => {
    if (!bookingId || !booking || !active(booking.status)) { socketRef.current?.close(); socketRef.current = null; if (reconnectRef.current !== null) window.clearTimeout(reconnectRef.current); reconnectRef.current = null; setSocketState('closed'); return; }
    let disposed = false;
    const clearTimer = () => { if (reconnectRef.current !== null) window.clearTimeout(reconnectRef.current); reconnectRef.current = null; };
    const schedule = () => { if (disposed || !navigator.onLine) { setSocketState('offline'); return; } clearTimer(); setSocketState('reconnecting'); const delay = Math.min(15000, 750 * Math.pow(2, Math.min(attemptRef.current++, 4))); reconnectRef.current = window.setTimeout(connect, delay); };
    const connect = () => {
      if (disposed) return;
      clearTimer();
      const url = socketUrl(bookingId); socketRef.current?.close(); setSocketState(attemptRef.current ? 'reconnecting' : 'connecting');
      let socket: WebSocket; try { socket = new WebSocket(url); } catch { schedule(); return; }
      socketRef.current = socket;
      socket.onopen = () => { if (socketRef.current !== socket) return; attemptRef.current = 0; setSocketState('live'); };
      socket.onmessage = event => {
        if (socketRef.current !== socket) return;
        try {
          const message = JSON.parse(event.data) as { type?: string; location?: TrackingPoint | null; phase?: string; tracking_health?: TrackingHealth | null };
          if (message.tracking_health) setBooking(previous => previous ? { ...previous, tracking_health: message.tracking_health } : previous);
          if (message.type === 'tracking_health') return;
          if (message.type === 'phase') { if (message.phase === 'HEADING_TO_PICKUP' || message.phase === 'IN_TRANSIT') { setJourneyPhase(message.phase); if (message.phase === 'IN_TRANSIT') { setPickupConfirmationError(null); setConfirmingPickup(false); } } return; }
          const point = message.location;
          if (!point || (message.type !== 'location' && message.type !== 'ready')) return;
          setPoints(previous => previous.some(item => item.id === point.id) ? previous : [point, ...previous].sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime()).slice(0, 200));
          setBooking(previous => previous ? { ...previous, last_known_latitude: point.latitude, last_known_longitude: point.longitude, last_location_at: point.recorded_at, tracking_health: { status: 'HEALTHY', is_live: true, age_seconds: 0, recent_point_count: Math.max(1, previous.tracking_health?.recent_point_count ?? 0) } } : previous);
          if (message.type === 'ready' && (message.phase === 'HEADING_TO_PICKUP' || message.phase === 'IN_TRANSIT')) setJourneyPhase(message.phase);
        } catch { /* Ignore malformed telemetry frames; the next valid frame will restore the live state. */ }
      };
      socket.onerror = () => { if (socketRef.current === socket) setSocketState('reconnecting'); };
      socket.onclose = () => { if (!disposed && socketRef.current === socket) { socketRef.current = null; void load().then(snapshot => { if (snapshot && active(snapshot.tracking.booking.status)) schedule(); }); } };
    };
    connect();
    return () => { disposed = true; clearTimer(); if (socketRef.current) socketRef.current.close(); socketRef.current = null; };
  }, [booking, bookingId, load]);

  const latest = points[0] ?? null;
  const currentPosition = useMemo<Coordinate | null>(() => {
    if (isMover && deviceGps && Number.isFinite(deviceGps.latitude) && Number.isFinite(deviceGps.longitude)) return [deviceGps.longitude, deviceGps.latitude];
    if (latest && validCoordinate(latest.latitude) && validCoordinate(latest.longitude)) return [latest.longitude, latest.latitude];
    if (booking && validCoordinate(booking.last_known_latitude) && validCoordinate(booking.last_known_longitude)) return [booking.last_known_longitude, booking.last_known_latitude];
    return null;
  }, [booking, deviceGps, isMover, latest]);
  const pickup = booking && validCoordinate(booking.pickup_latitude) && validCoordinate(booking.pickup_longitude) ? [booking.pickup_longitude, booking.pickup_latitude] as Coordinate : null;
  const dropoff = booking && validCoordinate(booking.dropoff_latitude) && validCoordinate(booking.dropoff_longitude) ? [booking.dropoff_longitude, booking.dropoff_latitude] as Coordinate : null;
  const activeTarget = journeyPhase === 'IN_TRANSIT' ? dropoff : pickup;
  const trackingHealth = booking?.tracking_health ?? null;
  const trackingIsLive = socketState === 'live' || trackingHealth?.is_live === true || trackingHealth?.status === 'HEALTHY';
  const latestGpsIsFresh = isMover && deviceGps ? true : latest ? Date.now() - new Date(latest.recorded_at).getTime() <= GPS_FRESHNESS_MS : false;
  const pickupDistanceMeters = currentPosition && pickup ? distanceMeters(currentPosition, pickup) : null;
  const showPickupConfirmation = Boolean(isMover && journeyPhase === 'HEADING_TO_PICKUP' && latestGpsIsFresh && pickupDistanceMeters !== null && pickupDistanceMeters <= PICKUP_CONFIRMATION_RADIUS_METERS);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    const position = currentPosition;
    if (position) {
      if (!moverMarkerRef.current) {
        const element = markerElement(isMover ? 'Your current location' : 'Mover current location', '#111827', '🚚');
        moverMarkerRef.current = new Marker({ element }).setLngLat(position).addTo(map);
      } else moverMarkerRef.current.setLngLat(position);
      if (!firstMapFitRef.current) { const bounds = new LngLatBounds(position, position); if (pickup) bounds.extend(pickup); if (dropoff) bounds.extend(dropoff); map.fitBounds(bounds, { padding: 100, maxZoom: 15, duration: 600 }); firstMapFitRef.current = true; } else if (followMover) map.easeTo({ center: position, duration: 500 });
    }
  }, [currentPosition, dropoff, followMover, isMover, mapReady, pickup]);

  const locationStatusLabel = trackingIsLive ? (isMover ? 'Location is live' : 'Mover location is live') : trackingHealth?.status === 'STARTING' ? 'Starting location sharing' : trackingHealth?.status === 'STALE' ? 'Last known mover location — stale' : 'Location offline';

  return <div className="fixed inset-0 z-[70] flex flex-col bg-gray-950 text-white">
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 p-3 sm:p-5"><div className="pointer-events-auto flex items-center gap-2 rounded-2xl bg-gray-950/85 p-2 shadow-xl backdrop-blur-md"><button type="button" onClick={() => navigate(isMover ? 'mover-booking-detail' : 'dashboard', isMover ? bookingId ?? undefined : undefined)} aria-label={isMover ? 'Back to booking' : 'Back to renter dashboard'} className="inline-flex h-10 w-10 items-center justify-center rounded-xl hover:bg-white/10"><ArrowLeft className="h-5 w-5" /></button><div className="pr-2"><p className="text-sm font-bold">{isMover ? 'Move navigation' : 'Live moving map'}</p><p className="text-[11px] text-gray-300">{isMover ? `Booking ${bookingId?.slice(0, 8)}…` : 'Back to renter dashboard'}</p></div></div><div className="pointer-events-auto flex items-center gap-2 rounded-2xl bg-gray-950/85 px-3 py-2 shadow-xl backdrop-blur-md"><Radio className="h-4 w-4" /><span className={cn('text-xs font-semibold', trackingIsLive ? 'text-green-300' : 'text-gray-200')}>{trackingIsLive ? 'CONNECTED' : socketState.toUpperCase()}</span><span className="hidden text-xs text-gray-300 sm:inline">· {locationStatusLabel}</span></div></div>
    <div ref={mapElementRef} className="min-h-0 flex-1 bg-gray-900" />
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 p-3 sm:p-5"><div className="mx-auto flex max-w-6xl flex-col gap-3"><div className="pointer-events-auto rounded-2xl bg-gray-950/90 p-4 shadow-2xl backdrop-blur-md"><div className="flex items-start gap-3"><Truck className="mt-0.5 h-5 w-5 shrink-0 text-green-400"/><div><p className="text-sm font-bold">{journeyPhase === 'IN_TRANSIT' ? 'In progress' : 'On the way to pickup'}</p><p className="mt-1 text-xs text-gray-300">{locationStatusLabel}</p></div></div></div></div></div>
  </div>;
}
