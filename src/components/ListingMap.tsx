import { useCallback, useEffect, useRef, useState } from 'react';
import { describeLocationError, prepareLiveMapLocation, watchPosition } from '@/lib/location';
import {
  FullscreenControl,
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  setWorkerUrl,
} from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Crosshair, Loader2, MapPin, Navigation } from 'lucide-react';
import { cn } from '@/lib/utils';

setWorkerUrl(maplibreWorkerUrl);

type Coordinate = [number, number];

type DeviceGpsPosition = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
};

type OsrmRouteResponse = {
  code: string;
  routes?: Array<{
    geometry?: { coordinates?: Coordinate[] };
    distance?: number;
    duration?: number;
  }>;
};

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const ROUTING_URL = 'https://router.project-osrm.org/route/v1/driving';
const ROUTE_REFRESH_METERS = 500;

function validCoordinate(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value);
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

function markerElement(label: string, className: string, icon: string) {
  const element = document.createElement('div');
  element.setAttribute('role', 'img');
  element.setAttribute('aria-label', label);
  element.title = label;
  element.className = className;
  element.style.width = '40px';
  element.style.height = '40px';
  element.style.borderRadius = '50%';
  element.style.border = '4px solid white';
  element.style.boxShadow = '0 3px 12px rgba(0,0,0,.3)';
  element.style.display = 'flex';
  element.style.alignItems = 'center';
  element.style.justifyContent = 'center';
  element.style.fontSize = '18px';
  element.textContent = icon;
  return element;
}

export interface ListingMapProps {
  latitude: number;
  longitude: number;
  title?: string | null;
  className?: string;
  /** Incremented only after the user taps Show Live Map and location is enabled. */
  locationRequestKey: number;
}

export default function ListingMap({ latitude, longitude, title, className, locationRequestKey }: ListingMapProps) {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const listingMarkerRef = useRef<Marker | null>(null);
  const userMarkerRef = useRef<Marker | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const routeRequestRef = useRef(0);
  const routeOriginRef = useRef<Coordinate | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [deviceGps, setDeviceGps] = useState<DeviceGpsPosition | null>(null);
  const [followListing, setFollowListing] = useState(false);
  const [route, setRoute] = useState<Coordinate[]>([]);
  const [routeDistanceKm, setRouteDistanceKm] = useState<number | null>(null);
  const [routeDurationMinutes, setRouteDurationMinutes] = useState<number | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationRetry, setLocationRetry] = useState(0);
  const [routeError, setRouteError] = useState<string | null>(null);

  const destination: Coordinate = [longitude, latitude];

  const drawRoute = useCallback((coordinates: Coordinate[]) => {
    const map = mapRef.current;
    if (!map) return;
    const source = map.getSource('listing-route') as { setData: (data: unknown) => void } | undefined;
    if (source) {
      source.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } });
      return;
    }
    if (!map.isStyleLoaded()) return;
    map.addSource('listing-route', {
      type: 'geojson',
      data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } },
    });
    map.addLayer({
      id: 'listing-route-line',
      type: 'line',
      source: 'listing-route',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#2563eb', 'line-width': 5, 'line-opacity': 0.85 },
    });
  }, []);

  const fitToRoute = useCallback((coordinates: Coordinate[]) => {
    const map = mapRef.current;
    if (!map || coordinates.length === 0) return;
    if (coordinates.length === 1) {
      map.easeTo({ center: coordinates[0], zoom: 15 });
      return;
    }
    const bounds = new LngLatBounds(coordinates[0], coordinates[0]);
    coordinates.forEach((coordinate) => bounds.extend(coordinate));
    map.fitBounds(bounds, { padding: 70, maxZoom: 15, duration: 700 });
  }, []);

  const requestRoute = useCallback(async (origin: Coordinate) => {
    const requestId = ++routeRequestRef.current;
    routeOriginRef.current = origin;
    setRouteError(null);
    try {
      const response = await fetch(
        `${ROUTING_URL}/${origin[0]},${origin[1]};${destination[0]},${destination[1]}?overview=full&geometries=geojson&steps=false`,
      );
      if (!response.ok) throw new Error('Route service unavailable.');
      const data = (await response.json()) as OsrmRouteResponse;
      const selected = data.routes?.[0];
      const coordinates = selected?.geometry?.coordinates ?? [];
      if (requestId !== routeRequestRef.current) return;
      if (data.code !== 'Ok' || coordinates.length === 0) {
        throw new Error('No driving route is available for this location.');
      }
      setRoute(coordinates);
      setRouteDistanceKm(typeof selected?.distance === 'number' ? selected.distance / 1000 : null);
      setRouteDurationMinutes(typeof selected?.duration === 'number' ? selected.duration / 60 : null);
      drawRoute(coordinates);
      if (followListing) fitToRoute(coordinates);
    } catch (error) {
      if (requestId !== routeRequestRef.current) return;
      setRouteError(error instanceof Error ? error.message : 'Unable to calculate a route.');
    }
  }, [destination, drawRoute, fitToRoute, followListing]);

  useEffect(() => {
    if (!mapElementRef.current) return;
    const map = new MapLibreMap({ container: mapElementRef.current, style: MAP_STYLE, center: destination, zoom: 13 });
    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: true }), 'top-right');
    map.addControl(new FullscreenControl(), 'top-right');

    map.on('load', () => {
      setMapReady(true);
      const marker = new Marker({ element: markerElement(title || 'Listing location', 'listing-map-destination', '⌂') })
        .setLngLat(destination)
        .addTo(map);
      listingMarkerRef.current = marker;
    });

    return () => {
      listingMarkerRef.current?.remove();
      userMarkerRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, [title]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setCenter(destination);
    listingMarkerRef.current?.setLngLat(destination);
    if (map.isStyleLoaded()) {
      if (map.getSource('listing-route')) {
        map.removeLayer('listing-route-line');
        map.removeSource('listing-route');
      }
      setRoute([]);
      setRouteDistanceKm(null);
      setRouteDurationMinutes(null);
    }
  }, [latitude, longitude]);

  useEffect(() => {
    // The map itself is the user's request to use live location. On Android,
    // request native location permission before starting the GPS watch.
    if (!mapReady || locationRequestKey === 0) return;

    let cancelled = false;
    let stopWatching: (() => void) | null = null;

    const handleCoordinates = (latitude: number, longitude: number, accuracy: number | null) => {
      if (cancelled) return;
      const next = { latitude, longitude, accuracy };
      const origin: Coordinate = [longitude, latitude];
      setDeviceGps(next);
      setLocationError(null);
      const marker = userMarkerRef.current;
      if (marker) marker.setLngLat(origin);
      else {
        userMarkerRef.current = new Marker({ element: markerElement('Your current location', 'listing-map-user', '●') })
          .setLngLat(origin)
          .addTo(mapRef.current!);
      }
      if (!routeOriginRef.current || distanceMeters(routeOriginRef.current, origin) >= ROUTE_REFRESH_METERS) {
        void requestRoute(origin);
      }
      if (followListing) {
        mapRef.current?.easeTo({ center: origin, duration: 400 });
      }
    };

    const handleLocationError = (message?: string) => {
      if (cancelled) return;
      setLocationError(message || 'Unable to read your current location. Check that Location is turned on and try again.');
    };

    // Asks for permission (system dialog in the app, browser prompt on the web) and starts
    // following the device. Failures become a readable message with a retry button.
    const startLocationTracking = async () => {
      try {
        const stop = await watchPosition(
          (position) => handleCoordinates(position.latitude, position.longitude, position.accuracy),
          (error) => handleLocationError(error.message),
        );
        if (cancelled) stop();
        else stopWatching = stop;
      } catch (error) {
        handleLocationError(describeLocationError(error));
      }
    };

    void startLocationTracking();

    return () => {
      cancelled = true;
      stopWatching?.();
    };
  }, [mapReady, requestRoute, followListing, locationRetry, locationRequestKey]);

  useEffect(() => {
    if (!followListing || !deviceGps) return;
    const origin: Coordinate = [deviceGps.longitude, deviceGps.latitude];
    mapRef.current?.easeTo({ center: origin, duration: 400 });
  }, [followListing, deviceGps]);

  const handleFollow = () => {
    if (!deviceGps) {
      setFollowListing(true);
      return;
    }
    setFollowListing((value) => !value);
    const origin: Coordinate = [deviceGps.longitude, deviceGps.latitude];
    void requestRoute(origin);
  };

  const handleEnableLocation = async () => {
    setLocationError(null);
    try {
      await prepareLiveMapLocation();
      setLocationRetry((value) => value + 1);
    } catch (error) {
      setLocationError(describeLocationError(error));
    }
  };

  const handleRecenter = () => {
    if (!deviceGps) {
      fitToRoute(route.length ? route : [destination]);
      return;
    }
    mapRef.current?.easeTo({ center: [deviceGps.longitude, deviceGps.latitude], zoom: 15, duration: 500 });
  };

  return (
    <div className={cn('overflow-hidden rounded-xl border border-gray-200 bg-gray-100 dark:border-brand-800 dark:bg-brand-900', className)}>
      <div className="relative h-[420px] w-full sm:h-[520px]">
        <div ref={mapElementRef} className="absolute inset-0" />
        {!mapReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100/90 dark:bg-brand-900/90">
            <Loader2 className="h-7 w-7 animate-spin text-brand-600" />
          </div>
        )}
        <div className="absolute left-3 top-3 right-3 flex flex-wrap items-start justify-between gap-2 pointer-events-none">
          <div className="rounded-lg bg-white/95 px-3 py-2 shadow-sm backdrop-blur dark:bg-brand-900/95">
            <p className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
              <MapPin className="h-4 w-4 text-brand-600" /> {title || 'Listing location'}
            </p>
            {routeDistanceKm !== null && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {routeDistanceKm.toFixed(1)} km{routeDurationMinutes !== null ? ` · ${Math.round(routeDurationMinutes)} min` : ''}
              </p>
            )}
          </div>
          <div className="pointer-events-auto flex gap-2">
            <button type="button" onClick={handleRecenter} className="rounded-lg bg-white p-2 text-gray-700 shadow-sm hover:bg-gray-50 dark:bg-brand-900 dark:text-gray-200 dark:hover:bg-brand-800" title="Recenter map">
              <Crosshair className="h-5 w-5" />
            </button>
            <button type="button" onClick={handleFollow} className={cn('flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold shadow-sm', followListing ? 'bg-brand-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-brand-900 dark:text-gray-200 dark:hover:bg-brand-800')}>
              <Navigation className="h-4 w-4" /> {followListing ? 'Following Listing' : 'Follow Listing'}
            </button>
          </div>
        </div>
        {(locationError || routeError) && (
          <div className="absolute bottom-3 left-3 right-3 flex items-start gap-3 rounded-lg bg-white/95 px-3 py-2 text-xs text-gray-600 shadow-sm backdrop-blur dark:bg-brand-900/95 dark:text-gray-300">
            <span className="min-w-0 flex-1">{locationError || routeError}</span>
            {locationError && (
              <button
                type="button"
                onClick={() => { void handleEnableLocation(); }}
                className="shrink-0 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
              >
                Enable location
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
