import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Crosshair, Loader2, MapPin, Radio, Route, Truck } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import { moverApi, type MoverBooking, type MoverTrackingPoint, type MoverTrackingResponse } from '@/lib/Movers/moverApi';
import { renterApi } from '@/lib/Renter/renterApi';
import { cn } from '@/lib/utils';

type TrackingPoint = MoverTrackingPoint;
type SocketState = 'connecting' | 'live' | 'reconnecting' | 'offline' | 'closed';
interface MapBooking extends MoverBooking {
  pickup_latitude: number | null;
  pickup_longitude: number | null;
  dropoff_latitude: number | null;
  dropoff_longitude: number | null;
}

type GoogleMapsApi = {
  maps: {
    Map: new (element: HTMLElement, options: Record<string, unknown>) => GoogleMapInstance;
    Marker: new (options: Record<string, unknown>) => GoogleMarker;
    Polyline: new (options: Record<string, unknown>) => GooglePolyline;
    InfoWindow: new (options?: Record<string, unknown>) => GoogleInfoWindow;
    LatLngBounds: new () => GoogleLatLngBounds;
  };
};
type GoogleMapInstance = {
  fitBounds: (bounds: GoogleLatLngBounds, padding?: number | { top: number; right: number; bottom: number; left: number }) => void;
  panTo: (position: { lat: number; lng: number }) => void;
  setZoom: (zoom: number) => void;
};
type GoogleMarker = {
  setPosition: (position: { lat: number; lng: number }) => void;
  setMap: (map: GoogleMapInstance | null) => void;
  addListener: (event: string, handler: () => void) => { remove: () => void };
};
type GooglePolyline = {
  setPath: (path: Array<{ lat: number; lng: number }>) => void;
  setMap: (map: GoogleMapInstance | null) => void;
};
type GoogleInfoWindow = {
  setContent: (content: string) => void;
  open: (options: { map: GoogleMapInstance; anchor: GoogleMarker }) => void;
};
type GoogleLatLngBounds = {
  extend: (position: { lat: number; lng: number }) => void;
};

declare global {
  interface Window {
    google?: GoogleMapsApi;
    __sakaKribGoogleMapsPromise?: Promise<GoogleMapsApi>;
  }
}

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

function loadGoogleMaps(): Promise<GoogleMapsApi> {
  if (window.google?.maps) return Promise.resolve(window.google);
  if (window.__sakaKribGoogleMapsPromise) return window.__sakaKribGoogleMapsPromise;

  const key = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim();
  if (!key) return Promise.reject(new Error('Google Maps is not configured. Add VITE_GOOGLE_MAPS_API_KEY to the frontend environment.'));

  window.__sakaKribGoogleMapsPromise = new Promise<GoogleMapsApi>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-sakakrib-google-maps]');
    if (existing) {
      existing.addEventListener('load', () => window.google?.maps ? resolve(window.google) : reject(new Error('Google Maps loaded without the Maps API.')));
      existing.addEventListener('error', () => reject(new Error('Unable to load Google Maps.')));
      return;
    }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly`;
    script.async = true;
    script.defer = true;
    script.dataset.sakakribGoogleMaps = 'true';
    script.onload = () => window.google?.maps ? resolve(window.google) : reject(new Error('Google Maps loaded without the Maps API.'));
    script.onerror = () => reject(new Error('Unable to load Google Maps. Check the API key and allowed referrers.'));
    document.head.appendChild(script);
  });
  return window.__sakaKribGoogleMapsPromise;
}

export default function LiveMovingMap() {
  const { profile } = useAuth();
  const { view, selectedMoverBookingId, selectedMoverId, navigate } = useNav();
  const isMover = profile?.role === 'mover';
  const bookingId = isMover ? selectedMoverBookingId : selectedMoverId;
  const [booking, setBooking] = useState<MapBooking | null>(null);
  const [points, setPoints] = useState<TrackingPoint[]>([]);
  const [socketState, setSocketState] = useState<SocketState>('closed');
  const [loading, setLoading] = useState(true);
  const [mapLoading, setMapLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [followMover, setFollowMover] = useState(true);
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<GoogleMapInstance | null>(null);
  const markerRef = useRef<GoogleMarker | null>(null);
  const pickupMarkerRef = useRef<GoogleMarker | null>(null);
  const dropoffMarkerRef = useRef<GoogleMarker | null>(null);
  const polylineRef = useRef<GooglePolyline | null>(null);
  const infoWindowRef = useRef<GoogleInfoWindow | null>(null);
  const markerClickRef = useRef<{ remove: () => void } | null>(null);
  const reconnectRef = useRef<number | null>(null);
  const attemptRef = useRef(0);
  const firstMapFitRef = useRef(false);

  const load = useCallback(async () => {
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
      setError(null);
      return trackingData;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load live map.');
      return null;
    } finally {
      setLoading(false);
    }
  }, [bookingId, isMover]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let disposed = false;
    loadGoogleMaps()
      .then(() => {
        if (!disposed) setMapLoading(false);
      })
      .catch((err: unknown) => {
        if (!disposed) {
          setMapLoading(false);
          setMapError(err instanceof Error ? err.message : 'Unable to load Google Maps.');
        }
      });
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    if (mapLoading || mapError || !mapElementRef.current || mapRef.current) return;
    const googleMaps = window.google;
    if (!googleMaps?.maps) return;

    mapRef.current = new googleMaps.maps.Map(mapElementRef.current, {
      center: { lat: -1.286389, lng: 36.817223 },
      zoom: 13,
      mapTypeControl: true,
      streetViewControl: true,
      fullscreenControl: true,
      zoomControl: true,
      clickableIcons: true,
      gestureHandling: 'greedy',
    });

    return () => {
      markerClickRef.current?.remove();
      markerClickRef.current = null;
      markerRef.current?.setMap(null);
      pickupMarkerRef.current?.setMap(null);
      dropoffMarkerRef.current?.setMap(null);
      polylineRef.current?.setMap(null);
      markerRef.current = null;
      pickupMarkerRef.current = null;
      dropoffMarkerRef.current = null;
      polylineRef.current = null;
      infoWindowRef.current = null;
      mapRef.current = null;
    };
  }, [mapLoading, mapError]);

  useEffect(() => {
    if (!bookingId || !booking || !active(booking.status)) {
      socketRefCleanup();
      return;
    }
    let disposed = false;
    const clearTimer = () => {
      if (reconnectRef.current !== null) window.clearTimeout(reconnectRef.current);
      reconnectRef.current = null;
    };
    const schedule = () => {
      if (disposed || !navigator.onLine) {
        setSocketState('offline');
        return;
      }
      clearTimer();
      setSocketState('reconnecting');
      const delay = Math.min(15000, 750 * Math.pow(2, Math.min(attemptRef.current++, 4)));
      reconnectRef.current = window.setTimeout(connect, delay);
    };
    const connect = () => {
      if (disposed) return;
      clearTimer();
      socketRef.current?.close();
      setSocketState(attemptRef.current ? 'reconnecting' : 'connecting');
      let socket: WebSocket;
      try {
        socket = new WebSocket(socketUrl(bookingId));
      } catch {
        schedule();
        return;
      }
      socketRef.current = socket;
      socket.onopen = () => {
        if (socketRef.current !== socket) return;
        attemptRef.current = 0;
        setSocketState('live');
      };
      socket.onmessage = event => {
        if (socketRef.current !== socket) return;
        try {
          const message = JSON.parse(event.data) as { type?: string; location?: TrackingPoint | null };
          const point = message.location;
          if (!point || (message.type !== 'location' && message.type !== 'ready')) return;
          setPoints(previous => {
            if (previous.some(item => item.id === point.id)) return previous;
            return [point, ...previous]
              .sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime())
              .slice(0, 200);
          });
          setBooking(previous => previous ? {
            ...previous,
            last_known_latitude: point.latitude,
            last_known_longitude: point.longitude,
            last_location_at: point.recorded_at,
          } : previous);
        } catch {
          // Ignore malformed frames; HTTP remains authoritative.
        }
      };
      socket.onerror = () => {
        if (socketRef.current === socket) setSocketState('reconnecting');
      };
      socket.onclose = () => {
        if (!disposed && socketRef.current === socket) {
          socketRef.current = null;
          void load().then(snapshot => {
            if (snapshot && active(snapshot.booking.status)) schedule();
          });
        }
      };
    };
    const recover = () => {
      attemptRef.current = 0;
      void load().then(snapshot => {
        if (snapshot && active(snapshot.booking.status)) connect();
      });
    };
    const online = () => recover();
    const offline = () => setSocketState('offline');
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    connect();
    return () => {
      disposed = true;
      clearTimer();
      socketRef.current?.close();
      socketRef.current = null;
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, [bookingId, booking?.status, load]);

  const socketRef = useRef<WebSocket | null>(null);
  const socketRefCleanup = () => {
    socketRef.current?.close();
    socketRef.current = null;
    if (reconnectRef.current !== null) window.clearTimeout(reconnectRef.current);
    reconnectRef.current = null;
    setSocketState('closed');
  };

  const latest = useMemo(
    () => [...points].sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime())[0] ?? null,
    [points],
  );

  const path = useMemo(
    () => [...points]
      .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime())
      .slice(-200)
      .map(point => ({ lat: point.latitude, lng: point.longitude })),
    [points],
  );

  useEffect(() => {
    const googleMaps = window.google;
    const map = mapRef.current;
    if (!googleMaps?.maps || !map || !booking) return;

    const pickup = validCoordinate(booking.pickup_latitude) && validCoordinate(booking.pickup_longitude)
      ? { lat: booking.pickup_latitude!, lng: booking.pickup_longitude! }
      : null;
    const dropoff = validCoordinate(booking.dropoff_latitude) && validCoordinate(booking.dropoff_longitude)
      ? { lat: booking.dropoff_latitude!, lng: booking.dropoff_longitude! }
      : null;

    if (pickup) {
      if (!pickupMarkerRef.current) {
        pickupMarkerRef.current = new googleMaps.maps.Marker({
          map,
          position: pickup,
          title: 'Pickup location',
          label: 'P',
        });
      } else {
        pickupMarkerRef.current.setPosition(pickup);
      }
    }

    if (dropoff) {
      if (!dropoffMarkerRef.current) {
        dropoffMarkerRef.current = new googleMaps.maps.Marker({
          map,
          position: dropoff,
          title: 'Drop-off location',
          label: 'D',
        });
      } else {
        dropoffMarkerRef.current.setPosition(dropoff);
      }
    }

    if (path.length) {
      if (!polylineRef.current) {
        polylineRef.current = new googleMaps.maps.Polyline({
          map,
          path,
          geodesic: true,
          strokeOpacity: 0.9,
          strokeWeight: 5,
        });
      } else {
        polylineRef.current.setPath(path);
      }
    }

    if (latest) {
      const position = { lat: latest.latitude, lng: latest.longitude };
      if (!markerRef.current) {
        markerRef.current = new googleMaps.maps.Marker({
          map,
          position,
          title: 'Mover current location',
          label: 'M',
          zIndex: 100,
        });
        infoWindowRef.current = new googleMaps.maps.InfoWindow();
        markerClickRef.current = markerRef.current.addListener('click', () => {
          if (!markerRef.current || !infoWindowRef.current || !map) return;
          const coordinates = `${latest.latitude.toFixed(6)}, ${latest.longitude.toFixed(6)}`;
          infoWindowRef.current.setContent(`<div style="min-width:180px"><strong>Live mover location</strong><br/>${coordinates}<br/>${new Date(latest.recorded_at).toLocaleTimeString('en-KE')}${latest.speed_kph != null ? `<br/>Speed: ${latest.speed_kph.toFixed(1)} km/h` : ''}</div>`);
          infoWindowRef.current.open({ map, anchor: markerRef.current });
        });
      } else {
        markerRef.current.setPosition(position);
      }

      if (!firstMapFitRef.current) {
        const bounds = new googleMaps.maps.LatLngBounds();
        if (pickup) bounds.extend(pickup);
        if (dropoff) bounds.extend(dropoff);
        bounds.extend(position);
        map.fitBounds(bounds, 80);
        firstMapFitRef.current = true;
      } else if (followMover) {
        map.panTo(position);
      }
    }
  }, [booking, latest, path, followMover]);

  useEffect(() => () => socketRefCleanup(), []);

  if (!bookingId) return null;
  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-gray-950 text-white"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }
  if (error && !booking) {
    return <div className="flex min-h-screen items-center justify-center bg-gray-950 p-6 text-white"><div className="max-w-lg rounded-2xl bg-brand-900 p-6 text-center"><p className="text-sm text-error-300">{error}</p><button type="button" onClick={() => navigate('mover-booking-detail', bookingId)} className="mt-5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold">Back to booking</button></div></div>;
  }

  const lat = latest?.latitude ?? booking?.last_known_latitude ?? null;
  const lng = latest?.longitude ?? booking?.last_known_longitude ?? null;
  const lastUpdated = latest?.recorded_at ?? booking?.last_location_at ?? null;

  return <div className="fixed inset-0 z-[70] flex flex-col bg-gray-950 text-white">
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 p-3 sm:p-5">
      <div className="pointer-events-auto flex items-center gap-2 rounded-2xl bg-gray-950/85 p-2 shadow-xl backdrop-blur-md">
        <button type="button" onClick={() => navigate('mover-booking-detail', bookingId)} aria-label="Back to booking" className="inline-flex h-10 w-10 items-center justify-center rounded-xl hover:bg-white/10"><ArrowLeft className="h-5 w-5" /></button>
        <div className="pr-2">
          <p className="text-sm font-bold">Live moving map</p>
          <p className="text-[11px] text-gray-300">Booking {bookingId.slice(0, 8)}…</p>
        </div>
      </div>
      <div className="pointer-events-auto flex items-center gap-2 rounded-2xl bg-gray-950/85 px-3 py-2 shadow-xl backdrop-blur-md">
        <Radio className="h-4 w-4" />
        <span className={cn('text-xs font-semibold', socketState === 'live' ? 'text-green-300' : 'text-gray-200')}>{socketState === 'live' ? 'LIVE' : socketState.toUpperCase()}</span>
      </div>
    </div>

    <div ref={mapElementRef} className="min-h-0 flex-1 bg-gray-900" aria-label="Google Maps live mover tracking map" />

    {(mapLoading || mapError) && <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-950/80 p-6 backdrop-blur-sm">
      <div className="max-w-md rounded-2xl bg-brand-900 p-6 text-center shadow-2xl">
        {mapLoading ? <><Loader2 className="mx-auto h-8 w-8 animate-spin" /><p className="mt-3 font-semibold">Loading Google Maps…</p></> : <><MapPin className="mx-auto h-8 w-8 text-error-400" /><p className="mt-3 font-semibold">Google Maps is not available</p><p className="mt-2 text-sm text-gray-300">{mapError}</p></>}
      </div>
    </div>}

    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 p-3 sm:p-5">
      <div className="mx-auto flex max-w-6xl flex-col gap-3">
        <div className="pointer-events-auto flex flex-wrap items-center gap-2 self-end rounded-2xl bg-gray-950/90 p-2 shadow-xl backdrop-blur-md">
          <button type="button" onClick={() => { setFollowMover(true); if (latest) mapRef.current?.panTo({ lat: latest.latitude, lng: latest.longitude }); }} className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold hover:bg-white/10"><Crosshair className="h-4 w-4" /> Follow mover</button>
          <button type="button" onClick={() => setFollowMover(value => !value)} className={cn('inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold', followMover ? 'bg-white/15' : 'hover:bg-white/10')}><Route className="h-4 w-4" /> {followMover ? 'Following' : 'Explore map'}</button>
        </div>
        <div className="pointer-events-auto grid gap-3 rounded-2xl bg-gray-950/90 p-4 shadow-2xl backdrop-blur-md sm:grid-cols-3">
          <div className="min-w-0"><p className="text-[11px] uppercase tracking-wide text-gray-400">Mover position</p><p className="mt-1 truncate text-sm font-bold">{lat !== null && lng !== null ? `${lat.toFixed(6)}, ${lng.toFixed(6)}` : 'Waiting for GPS…'}</p><p className="mt-1 text-[11px] text-gray-400">{lastUpdated ? `Updated ${new Date(lastUpdated).toLocaleTimeString('en-KE')}` : 'No accepted GPS point yet'}</p></div>
          <div className="min-w-0"><p className="text-[11px] uppercase tracking-wide text-gray-400">Journey</p><p className="mt-1 flex items-center gap-2 text-sm font-bold"><Truck className="h-4 w-4" /> {String(booking?.status ?? 'unknown').replace(/_/g, ' ')}</p><p className="mt-1 text-[11px] text-gray-400">{points.length} GPS points received</p></div>
          <div className="min-w-0"><p className="text-[11px] uppercase tracking-wide text-gray-400">Movement</p><p className="mt-1 text-sm font-bold">{latest?.speed_kph != null ? `${latest.speed_kph.toFixed(1)} km/h` : 'Speed unavailable'}</p><p className="mt-1 text-[11px] text-gray-400">{isMover ? 'Your current device location is being shared.' : 'Mover location is updated from the tracking service.'}</p></div>
        </div>
      </div>
    </div>
  </div>;
}
