import { useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import { moverApi } from '@/lib/Movers/moverApi';

interface BookingState { id: string; status: string | null; payment_status: string | null; }
interface PendingLocation {
  latitude: number;
  longitude: number;
  accuracy_meters: number | null;
  speed_kph: number | null;
  heading_degrees: number | null;
}
const normalized = (value: string | null | undefined) => String(value ?? '').trim().toLowerCase().replace(/-/g, '_');
const active = (value: string | null | undefined) => normalized(value) === 'in_progress';
const paid = (value: string | null | undefined) => normalized(value) === 'paid';
const TRACK_INTERVAL_MS = 5000;
const GPS_MAX_AGE_MS = 5000;
const GPS_TIMEOUT_MS = 20000;
const RETRY_INTERVAL_MS = 5000;
const BOOKING_STATE_INTERVAL_MS = 5000;
const GPS_PROBE_INTERVAL_MS = 5000;

/** Publishes mover GPS through the canonical Django mover API. */
export default function MovingGpsTracker() {
  const { profile } = useAuth();
  const { view, selectedMoverBookingId } = useNav();
  const watchIdRef = useRef<number | null>(null);
  const gpsProbeTimerRef = useRef<number | null>(null);
  const bookingIdRef = useRef<string | null>(null);
  const lastSentAtRef = useRef(0);
  const startingRef = useRef(false);
  const cancelledRef = useRef(false);
  const pendingRef = useRef<PendingLocation | null>(null);
  const sendingRef = useRef(false);
  const retryTimerRef = useRef<number | null>(null);

  useEffect(() => {
    cancelledRef.current = false;
    const clearRetry = () => {
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
    const clearGpsProbe = () => {
      if (gpsProbeTimerRef.current !== null) {
        window.clearInterval(gpsProbeTimerRef.current);
        gpsProbeTimerRef.current = null;
      }
    };
    const stop = () => {
      if (watchIdRef.current !== null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      clearRetry();
      clearGpsProbe();
      startingRef.current = false;
      sendingRef.current = false;
      pendingRef.current = null;
    };
    const canTrack = Boolean(profile) && normalized(profile?.role) === 'mover' &&
      (view === 'mover-booking-detail' || view === 'mover-tracking') &&
      Boolean(selectedMoverBookingId) && 'geolocation' in navigator;
    if (!canTrack) {
      stop();
      bookingIdRef.current = null;
      return () => { cancelledRef.current = true; stop(); };
    }
    const bookingId = selectedMoverBookingId!;
    bookingIdRef.current = bookingId;

    const sendPending = async () => {
      if (cancelledRef.current || bookingIdRef.current !== bookingId || sendingRef.current) return;
      const location = pendingRef.current;
      if (!location || !navigator.onLine) return;
      const now = Date.now();
      if (now - lastSentAtRef.current < TRACK_INTERVAL_MS) return;
      sendingRef.current = true;
      try {
        await moverApi.recordLocation(bookingId, location);
        if (!cancelledRef.current && bookingIdRef.current === bookingId && pendingRef.current === location) {
          pendingRef.current = null;
          lastSentAtRef.current = Date.now();
        }
      } catch (error) {
        console.warn('Live GPS update was rejected or unavailable:', error);
        if (!cancelledRef.current && bookingIdRef.current === bookingId) {
          clearRetry();
          retryTimerRef.current = window.setTimeout(() => {
            retryTimerRef.current = null;
            void sendPending();
          }, RETRY_INTERVAL_MS);
        }
      } finally {
        sendingRef.current = false;
      }
    };

    const publish = (position: GeolocationPosition) => {
      if (cancelledRef.current || bookingIdRef.current !== bookingId) return;
      const accuracy = Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null;
      const location: PendingLocation = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy_meters: accuracy,
        speed_kph: position.coords.speed == null ? null : Math.max(0, position.coords.speed * 3.6),
        heading_degrees: position.coords.heading == null ? null : position.coords.heading,
      };
      // Keep only the newest unsent point. We never replay an old GPS fix as if it were live.
      pendingRef.current = location;
      void sendPending();
    };

    const handleGpsError = (error: GeolocationPositionError) => {
      console.warn('Mover GPS unavailable:', error.code, error.message);
      // watchPosition may not recover on its own after a transient timeout. The
      // periodic probe below deliberately asks the browser for another fresh fix.
    };

    const probeGps = () => {
      if (cancelledRef.current || bookingIdRef.current !== bookingId || !navigator.onLine) return;
      navigator.geolocation.getCurrentPosition(publish, handleGpsError, {
        enableHighAccuracy: true,
        maximumAge: GPS_MAX_AGE_MS,
        timeout: GPS_TIMEOUT_MS,
      });
    };

    const start = () => {
      if (startingRef.current || watchIdRef.current !== null || cancelledRef.current) return;
      startingRef.current = true;
      try {
        watchIdRef.current = navigator.geolocation.watchPosition(
          publish,
          handleGpsError,
          { enableHighAccuracy: true, maximumAge: GPS_MAX_AGE_MS, timeout: GPS_TIMEOUT_MS },
        );
        // Some mobile browsers deliver watchPosition fixes unreliably while the
        // page is backgrounded or the device's location provider changes. Keep a
        // lightweight explicit probe as a recovery path; server throttling still
        // limits accepted writes to one point per five seconds.
        probeGps();
        gpsProbeTimerRef.current = window.setInterval(probeGps, GPS_PROBE_INTERVAL_MS);
      } finally {
        startingRef.current = false;
      }
    };

    const syncBookingState = async () => {
      if (cancelledRef.current || bookingIdRef.current !== bookingId) return;
      try {
        const detail = await moverApi.getBookingDetail(bookingId);
        const booking = detail?.booking as BookingState | undefined;
        if (cancelledRef.current || bookingIdRef.current !== bookingId) return;
        if (booking && active(booking.status) && paid(booking.payment_status)) {
          start();
        } else {
          stop();
        }
      } catch (error) {
        // A temporary state-fetch failure must not fabricate a new GPS session.
        // Keep an already-running watcher alive; the server remains authoritative.
        console.warn('Unable to refresh mover journey state:', error);
      }
    };

    const restart = () => { if (!cancelledRef.current) void syncBookingState(); };
    const handleVisibility = () => { if (document.visibilityState === 'visible') restart(); };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('online', restart);
    window.addEventListener('pageshow', restart);

    void syncBookingState();
    const stateTimer = window.setInterval(() => { void syncBookingState(); }, BOOKING_STATE_INTERVAL_MS);

    return () => {
      cancelledRef.current = true;
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', restart);
      window.removeEventListener('pageshow', restart);
      window.clearInterval(stateTimer);
      stop();
      bookingIdRef.current = null;
    };
  }, [profile, view, selectedMoverBookingId]);
  return null;
}
