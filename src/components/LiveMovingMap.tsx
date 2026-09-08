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
import { ArrowLeft, Crosshair, Loader2, Radio, Route, Truck } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import { moverApi, type MoverBooking, type MoverTrackingPoint, type MoverTrackingResponse } from '@/lib/Movers/moverApi';
import { renterApi } from '@/lib/Renter/renterApi';
import { cn } from '@/lib/utils';

setWorkerUrl(maplibreWorkerUrl);

type TrackingPoint = MoverTrackingPoint;
type SocketState = 'connecting' | 'live' | 'reconnecting' | 'offline' | 'closed';

interface MapBooking extends MoverBooking {
  pickup_latitude: number | null;
  pickup_longitude: number | null;
  dropoff_latitude: number | null;
  dropoff_longitude: number | null;
}

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

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

export default function LiveMovingMap() {
  const { profile } = useAuth();
  const { selectedMoverBookingId, selectedMoverId, navigate } = useNav();
  const isMover = profile?.role === 'mover';
  const bookingId = isMover ? selectedMoverBookingId : selectedMoverId;

  const [booking, setBooking] = useState<MapBooking | null>(null);
  const [points, setPoints] = useState<TrackingPoint[]>([]);
  const [socketState, setSocketState] = useState<SocketState>('closed');
  const [loading, setLoading] = useState(false);
  const [mapLoading, setMapLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [followMover, setFollowMover] = useState(true);

  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const moverMarkerRef = useRef<Marker | null>(null);
  const pickupMarkerRef = useRef<Marker | null>(null);
  const dropoffMarkerRef = useRef<Marker | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const routeSourceReadyRef = useRef(false);
  const reconnectRef = useRef<number | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const attemptRef = useRef(0);
  const firstMapFitRef = useRef(false);

  useEffect(() => {
    console.log('[LiveMovingMap] component mounted', {
      profileRole: profile?.role,
      isMover,
      selectedMoverBookingId,
      selectedMoverId,
      bookingId,
      mapStyle: MAP_STYLE,
    });

    return () => {
      console.log('[LiveMovingMap] component unmounted');
    };
  }, []);

  useEffect(() => {
    console.log('[LiveMovingMap] booking context changed', {
      profileRole: profile?.role,
      isMover,
      selectedMoverBookingId,
      selectedMoverId,
      bookingId,
    });
  }, [profile?.role, isMover, selectedMoverBookingId, selectedMoverId, bookingId]);

  const load = useCallback(async () => {
    console.log('[LiveMovingMap] load started', { bookingId, isMover });

    if (!bookingId) {
      console.warn('[LiveMovingMap] load skipped: no bookingId');
      setLoading(false);
      return null;
    }

    try {
      console.log('[LiveMovingMap] requesting booking/tracking data', {
        bookingId,
        source: isMover ? 'moverApi' : 'renterApi',
      });

      const [tracking, selectedBooking] = isMover
        ? await Promise.all([moverApi.getTracking(bookingId), moverApi.getBooking(bookingId)])
        : await Promise.all([renterApi.getTracking(bookingId), renterApi.getBooking(bookingId)]);

      const trackingData = tracking as MoverTrackingResponse;
      const bookingData = selectedBooking as MapBooking;

      console.log('[LiveMovingMap] booking/tracking data received', {
        bookingId,
        bookingStatus: bookingData.status,
        trackingPoints: trackingData.tracking_points?.length ?? 0,
        trackingBooking: trackingData.booking,
      });

      setBooking({ ...bookingData, ...(trackingData.booking as Partial<MapBooking>) });
      setPoints(trackingData.tracking_points ?? []);
      setError(null);
      return trackingData;
    } catch (err) {
      console.error('[LiveMovingMap] load failed', err);
      setError(err instanceof Error ? err.message : 'Unable to load live map.');
      return null;
    } finally {
      console.log('[LiveMovingMap] load finished');
      setLoading(false);
    }
  }, [bookingId, isMover]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    console.log('[LiveMovingMap] map initialization effect entered', {
      hasContainer: Boolean(mapElementRef.current),
      hasExistingMap: Boolean(mapRef.current),
    });

    if (!mapElementRef.current || mapRef.current) {
      console.warn('[LiveMovingMap] map initialization skipped', {
        hasContainer: Boolean(mapElementRef.current),
        hasExistingMap: Boolean(mapRef.current),
      });
      return;
    }

    console.log('[LiveMovingMap] creating MapLibre map', {
      style: MAP_STYLE,
      center: [36.817223, -1.286389],
      zoom: 12,
      workerUrl: maplibreWorkerUrl,
    });

    try {
      const map = new MapLibreMap({
        container: mapElementRef.current,
        style: MAP_STYLE,
        center: [36.817223, -1.286389],
        zoom: 12,
        attributionControl: {},
        cooperativeGestures: false,
      });

      console.log('[LiveMovingMap] MapLibre instance created');

      map.addControl(new NavigationControl({ showCompass: true }), 'top-right');
      map.addControl(new FullscreenControl(), 'top-right');

      map.on('style.load', () => {
        console.log('[LiveMovingMap] MapLibre style.load fired', {
          isStyleLoaded: map.isStyleLoaded(),
        });
      });

      map.on('load', () => {
        console.log('[LiveMovingMap] MapLibre load fired', {
          isStyleLoaded: map.isStyleLoaded(),
          center: map.getCenter().toArray(),
          zoom: map.getZoom(),
        });
        setMapLoading(false);
      });

      map.on('error', event => {
        console.error('[LiveMovingMap] MapLibre error event', {
          event,
          error: event.error,
          message: event.error?.message,
          stack: event.error?.stack,
        });
        if (event.error) {
          setMapError(event.error.message || 'Unable to load the map.');
          setMapLoading(false);
        }
      });

      map.on('idle', () => {
        console.log('[LiveMovingMap] MapLibre idle fired', {
          isStyleLoaded: map.isStyleLoaded(),
        });
      });

      map.on('webglcontextlost', event => {
        console.error('[LiveMovingMap] WebGL context lost', event);
      });

      map.on('webglcontextrestored', () => {
        console.log('[LiveMovingMap] WebGL context restored');
      });

      mapRef.current = map;
      console.log('[LiveMovingMap] MapLibre map stored in mapRef');
    } catch (err) {
      console.error('[LiveMovingMap] MapLibre initialization threw', err);
      setMapLoading(false);
      setMapError(err instanceof Error ? err.message : 'Unable to initialize MapLibre.');
    }

    return () => {
      console.log('[LiveMovingMap] map initialization cleanup');
      popupRef.current?.remove();
      popupRef.current = null;
      moverMarkerRef.current?.remove();
      pickupMarkerRef.current?.remove();
      dropoffMarkerRef.current?.remove();
      moverMarkerRef.current = null;
      pickupMarkerRef.current = null;
      dropoffMarkerRef.current = null;
      routeSourceReadyRef.current = false;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    console.log('[LiveMovingMap] websocket effect evaluated', {
      bookingId,
      bookingStatus: booking?.status,
      isActive: active(booking?.status),
    });

    if (!bookingId || !booking || !active(booking.status)) {
      console.log('[LiveMovingMap] websocket not started: booking is not active');
      socketRef.current?.close();
      socketRef.current = null;
      if (reconnectRef.current !== null) window.clearTimeout(reconnectRef.current);
      reconnectRef.current = null;
      setSocketState('closed');
      return;
    }

    let disposed = false;

    const clearTimer = () => {
      if (reconnectRef.current !== null) window.clearTimeout(reconnectRef.current);
      reconnectRef.current = null;
    };

    const schedule = () => {
      if (disposed || !navigator.onLine) {
        console.warn('[LiveMovingMap] websocket reconnect skipped', {
          disposed,
          online: navigator.onLine,
        });
        setSocketState('offline');
        return;
      }
      clearTimer();
      setSocketState('reconnecting');
      const delay = Math.min(15000, 750 * Math.pow(2, Math.min(attemptRef.current++, 4)));
      console.log('[LiveMovingMap] scheduling websocket reconnect', { delay });
      reconnectRef.current = window.setTimeout(connect, delay);
    };

    const connect = () => {
      if (disposed) return;
      clearTimer();
      const url = socketUrl(bookingId);
      console.log('[LiveMovingMap] opening websocket', { url });
      socketRef.current?.close();
      setSocketState(attemptRef.current ? 'reconnecting' : 'connecting');

      let socket: WebSocket;
      try {
        socket = new WebSocket(url);
      } catch (err) {
        console.error('[LiveMovingMap] websocket constructor failed', err);
        schedule();
        return;
      }

      socketRef.current = socket;

      socket.onopen = () => {
        console.log('[LiveMovingMap] websocket opened', { url });
        if (socketRef.current !== socket) return;
        attemptRef.current = 0;
        setSocketState('live');
      };

      socket.onmessage = event => {
        console.log('[LiveMovingMap] websocket message received', event.data);
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
        } catch (err) {
          console.error('[LiveMovingMap] malformed websocket frame', err);
          // Ignore malformed frames; HTTP remains authoritative.
        }
      };

      socket.onerror = event => {
        console.error('[LiveMovingMap] websocket error', event);
        if (socketRef.current === socket) setSocketState('reconnecting');
      };

      socket.onclose = event => {
        console.warn('[LiveMovingMap] websocket closed', {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
        });
        if (!disposed && socketRef.current === socket) {
          socketRef.current = null;
          void load().then(snapshot => {
            if (snapshot && active(snapshot.booking.status)) schedule();
          });
        }
      };
    };

    const recover = () => {
      console.log('[LiveMovingMap] websocket recovery triggered');
      attemptRef.current = 0;
      void load().then(snapshot => {
        if (snapshot && active(snapshot.booking.status)) connect();
      });
    };

    const online = () => {
      console.log('[LiveMovingMap] browser online event');
      recover();
    };
    const offline = () => {
      console.warn('[LiveMovingMap] browser offline event');
      setSocketState('offline');
    };

    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    connect();

    return () => {
      console.log('[LiveMovingMap] websocket effect cleanup');
      disposed = true;
      clearTimer();
      socketRef.current?.close();
      socketRef.current = null;
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, [bookingId, booking?.status, load]);

  const latest = useMemo(
    () => [...points].sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime())[0] ?? null,
    [points],
  );

  const path = useMemo(
    () => [...points]
      .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime())
      .slice(-200)
      .map(point => [point.longitude, point.latitude] as [number, number]),
    [points],
  );

  useEffect(() => {
    const map = mapRef.current;
    console.log('[LiveMovingMap] map rendering effect evaluated', {
      hasMap: Boolean(map),
      hasBooking: Boolean(booking),
      bookingStatus: booking?.status,
      styleLoaded: map?.isStyleLoaded() ?? false,
      latestPoint: latest,
      pathPoints: path.length,
    });

    if (!map || !booking || !map.isStyleLoaded()) {
      console.warn('[LiveMovingMap] map rendering skipped', {
        reason: !map ? 'map unavailable' : !booking ? 'booking unavailable' : 'map style not loaded',
      });
      return;
    }

    const pickup = validCoordinate(booking.pickup_latitude) && validCoordinate(booking.pickup_longitude)
      ? [booking.pickup_longitude!, booking.pickup_latitude!] as [number, number]
      : null;
    const dropoff = validCoordinate(booking.dropoff_latitude) && validCoordinate(booking.dropoff_longitude)
      ? [booking.dropoff_longitude!, booking.dropoff_latitude!] as [number, number]
      : null;

    console.log('[LiveMovingMap] rendering map data', {
      pickup,
      dropoff,
      latest,
      pathPoints: path.length,
    });

    if (pickup) {
      if (!pickupMarkerRef.current) {
        pickupMarkerRef.current = new Marker({ color: '#2563eb' })
          .setLngLat(pickup)
          .setPopup(new Popup({ offset: 18 }).setHTML('<strong>Pickup location</strong>'))
          .addTo(map);
      } else {
        pickupMarkerRef.current.setLngLat(pickup);
      }
    }

    if (dropoff) {
      if (!dropoffMarkerRef.current) {
        dropoffMarkerRef.current = new Marker({ color: '#dc2626' })
          .setLngLat(dropoff)
          .setPopup(new Popup({ offset: 18 }).setHTML('<strong>Drop-off location</strong>'))
          .addTo(map);
      } else {
        dropoffMarkerRef.current.setLngLat(dropoff);
      }
    }

    const routeGeoJson = {
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'LineString' as const,
        coordinates: path,
      },
    };

    if (map.getSource('mover-travel-path')) {
      (map.getSource('mover-travel-path') as import('maplibre-gl').GeoJSONSource).setData(routeGeoJson);
    } else {
      map.addSource('mover-travel-path', { type: 'geojson', data: routeGeoJson });
      map.addLayer({
        id: 'mover-travel-path-line',
        type: 'line',
        source: 'mover-travel-path',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-width': 5, 'line-opacity': 0.85 },
      });
    }
    routeSourceReadyRef.current = true;

    if (latest) {
      const position: [number, number] = [latest.longitude, latest.latitude];
      if (!moverMarkerRef.current) {
        moverMarkerRef.current = new Marker({ color: '#16a34a' }).setLngLat(position).addTo(map);
        moverMarkerRef.current.getElement().setAttribute('aria-label', 'Mover current location');
        moverMarkerRef.current.getElement().title = 'Mover current location';
        moverMarkerRef.current.getElement().addEventListener('click', () => {
          popupRef.current?.remove();
          popupRef.current = new Popup({ offset: 28 })
            .setLngLat(position)
            .setHTML(`<strong>Live mover location</strong><br/>${latest.latitude.toFixed(6)}, ${latest.longitude.toFixed(6)}<br/>${new Date(latest.recorded_at).toLocaleTimeString('en-KE')}${latest.speed_kph != null ? `<br/>Speed: ${latest.speed_kph.toFixed(1)} km/h` : ''}`)
            .addTo(map);
        });
      } else {
        moverMarkerRef.current.setLngLat(position);
      }

      if (!firstMapFitRef.current) {
        const bounds = new LngLatBounds(position, position);
        if (pickup) bounds.extend(pickup);
        if (dropoff) bounds.extend(dropoff);
        map.fitBounds(bounds, { padding: 100, maxZoom: 15, duration: 600 });
        firstMapFitRef.current = true;
      } else if (followMover) {
        map.easeTo({ center: position, duration: 500 });
      }
    }
  }, [booking, latest, path, followMover]);

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

    <div ref={mapElementRef} className="min-h-0 flex-1 bg-gray-900" aria-label="MapLibre live mover tracking map" />

    {(mapLoading || mapError) && <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-950/80 p-6 backdrop-blur-sm">
      <div className="max-w-md rounded-2xl bg-brand-900 p-6 text-center shadow-2xl">
        {mapLoading ? <><Loader2 className="mx-auto h-8 w-8 animate-spin" /><p className="mt-3 font-semibold">Loading live map…</p></> : <><p className="text-sm font-semibold">Map is not available</p><p className="mt-2 text-sm text-gray-300">{mapError}</p></>}
      </div>
    </div>}

    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 p-3 sm:p-5">
      <div className="mx-auto flex max-w-6xl flex-col gap-3">
        <div className="pointer-events-auto flex flex-wrap items-center gap-2 self-end rounded-2xl bg-gray-950/90 p-2 shadow-xl backdrop-blur-md">
          <button type="button" onClick={() => { setFollowMover(true); if (latest) mapRef.current?.easeTo({ center: [latest.longitude, latest.latitude], duration: 500 }); }} className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold hover:bg-white/10"><Crosshair className="h-4 w-4" /> Follow mover</button>
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
