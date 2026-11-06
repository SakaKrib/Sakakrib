import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, MapPin, Navigation } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import { moverApi, type MoverBooking, type MoverJourneyPhaseResponse, type MoverTrackingResponse } from '@/lib/Movers/moverApi';
import { agoLabel, DELIVERY_RADIUS_METERS, PICKUP_RADIUS_METERS, distanceMeters, formatCoordinates, formatDistance } from '@/lib/journeyRules';
import { cn } from '@/lib/utils';

const POLL_MS = 8000;
const norm = (v: string | null | undefined) => String(v ?? '').trim().toLowerCase().replace(/-/g, '_');

/**
 * Heads-up card, styled like a system notification, shown to the mover and the renter while a
 * moving journey is in progress. It follows the journey in the background: live coordinates,
 * how far the vehicle is from the next stop, and whether the GPS feed is healthy.
 * Tapping it opens the full live map.
 */
export default function LiveJourneyNotification() {
  const { profile } = useAuth();
  const { view, navigate } = useNav();
  const role = norm(profile?.role);
  const eligible = Boolean(profile) && (role === 'mover' || role === 'renter');

  const [booking, setBooking] = useState<MoverBooking | null>(null);
  const [tracking, setTracking] = useState<MoverTrackingResponse | null>(null);
  const [phase, setPhase] = useState<MoverJourneyPhaseResponse['phase']>(null);
  const [expanded, setExpanded] = useState(false);
  const [, setNow] = useState(0);
  const bookingIdRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      let current = bookingIdRef.current ? booking : null;
      if (!current || norm(current.status) !== 'in_progress') {
        const all = await moverApi.getBookings();
        current = (all ?? []).find((b) => norm(b.status) === 'in_progress'
          && (role === 'mover' ? true : b.renter_id === profile?.id)) ?? null;
        setBooking(current);
        bookingIdRef.current = current?.id ?? null;
      }
      if (!current) { setTracking(null); setPhase(null); return; }
      const [track, ph] = await Promise.all([
        moverApi.getTracking(current.id),
        moverApi.getJourneyPhase(current.id).catch(() => null),
      ]);
      setTracking(track);
      setPhase(ph?.phase ?? null);
      if (norm(track.booking.status) !== 'in_progress') { setBooking(null); bookingIdRef.current = null; }
    } catch { /* keep the last good snapshot; the next poll retries */ }
  }, [booking, profile?.id, role]);

  useEffect(() => {
    if (!eligible) { setBooking(null); setTracking(null); bookingIdRef.current = null; return; }
    void refresh();
    const id = window.setInterval(() => { if (!document.hidden) void refresh(); }, POLL_MS);
    const clock = window.setInterval(() => setNow((n) => n + 1), 1000);
    return () => { window.clearInterval(id); window.clearInterval(clock); };
  }, [eligible, refresh]);

  if (!eligible || !booking || !tracking || view === 'live-mover-map') return null;

  const b = tracking.booking;
  const lat = b.last_known_latitude; const lng = b.last_known_longitude;
  const toPickup = phase !== 'IN_TRANSIT';
  const targetLat = toPickup ? booking.pickup_latitude : booking.dropoff_latitude;
  const targetLng = toPickup ? booking.pickup_longitude : booking.dropoff_longitude;
  const meters = lat != null && lng != null && targetLat != null && targetLng != null
    ? distanceMeters(Number(lat), Number(lng), Number(targetLat), Number(targetLng)) : null;
  const radius = toPickup ? PICKUP_RADIUS_METERS : DELIVERY_RADIUS_METERS;
  const arrived = meters !== null && meters <= radius;
  const point = tracking.tracking_points?.[tracking.tracking_points.length - 1];
  const health = b.tracking_health;
  const live = Boolean(health?.is_live);
  const dot = live ? 'bg-success-500' : health?.status === 'STARTING' ? 'bg-amber-500' : 'bg-error-500';
  const headline = role === 'mover'
    ? (toPickup ? 'Heading to pickup' : 'Delivering to destination')
    : (toPickup ? 'Your mover is on the way' : 'Your items are on the move');
  const sub = meters === null ? 'Waiting for GPS…'
    : arrived ? (toPickup ? 'At the pickup point' : 'At the destination')
    : `${formatDistance(meters)} to ${toPickup ? 'pickup' : 'destination'}`;

  return (
    <div className="pointer-events-none fixed inset-x-0 z-[9990] flex justify-center px-3" style={{ top: 'calc(var(--app-safe-top, 0px) + 8px)' }}>
      <div className="pointer-events-auto w-full max-w-md overflow-hidden rounded-2xl border border-gray-200 bg-white/95 shadow-xl ring-1 ring-black/5 backdrop-blur dark:border-brand-700 dark:bg-brand-900/95">
        <div className="flex items-center gap-3 px-3 py-2.5">
          <button type="button" onClick={() => navigate('live-mover-map', booking.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
            <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white"><Navigation className="h-4 w-4" /><span className={cn('absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-brand-900', dot, live && 'animate-pulse')} /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-gray-900 dark:text-white">{headline}</span>
              <span className={cn('block truncate text-xs', arrived ? 'font-semibold text-success-600 dark:text-success-400' : 'text-gray-500 dark:text-gray-400')}>{sub} · {live ? 'live' : (health?.status ?? 'offline').toString().toLowerCase()}</span>
            </span>
          </button>
          <button type="button" aria-label={expanded ? 'Hide details' : 'Show details'} onClick={() => setExpanded((v) => !v)} className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-brand-800">{expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button>
        </div>
        {expanded && (
          <div className="space-y-2 border-t border-gray-100 px-3 py-3 text-xs dark:border-brand-800">
            <div className="flex items-start gap-2"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-600" /><div><p className="font-semibold text-gray-800 dark:text-gray-100">{formatCoordinates(lat, lng)}</p><p className="text-gray-500 dark:text-gray-400">Updated {agoLabel(b.last_location_at)}</p></div></div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-gray-50 p-2 dark:bg-brand-950/50"><p className="text-[10px] uppercase text-gray-400">Speed</p><p className="font-semibold text-gray-800 dark:text-gray-100">{point?.speed_kph != null ? `${Math.round(point.speed_kph)} km/h` : '—'}</p></div>
              <div className="rounded-lg bg-gray-50 p-2 dark:bg-brand-950/50"><p className="text-[10px] uppercase text-gray-400">Accuracy</p><p className="font-semibold text-gray-800 dark:text-gray-100">{point?.accuracy_meters != null ? `±${Math.round(point.accuracy_meters)} m` : '—'}</p></div>
              <div className="rounded-lg bg-gray-50 p-2 dark:bg-brand-950/50"><p className="text-[10px] uppercase text-gray-400">Target</p><p className="font-semibold text-gray-800 dark:text-gray-100">{toPickup ? 'Pickup' : 'Drop-off'}</p></div>
            </div>
            <p className="text-gray-500 dark:text-gray-400">To {toPickup ? 'pickup' : 'destination'}: {formatCoordinates(targetLat, targetLng)}</p>
            {role === 'mover' && !arrived && <p className="text-amber-700 dark:text-amber-300">{toPickup ? 'Confirm collection' : 'Finish the journey'} once you are within {formatDistance(radius)} of the {toPickup ? 'pickup point' : 'destination'}.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
