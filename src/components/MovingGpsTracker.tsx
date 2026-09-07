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
const active = (value: string | null | undefined) => String(value ?? '').trim().toLowerCase().replace(/-/g, '_') === 'in_progress';
const TRACK_INTERVAL_MS = 5000;
const GPS_MAX_AGE_MS = 5000;
const GPS_TIMEOUT_MS = 20000;
const RETRY_INTERVAL_MS = 5000;

/** Publishes mover GPS through the canonical Django mover API. */
export default function MovingGpsTracker() {
  const { profile } = useAuth();
  const { view, selectedMoverBookingId } = useNav();
  const watchIdRef = useRef<number | null>(null);
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
    const stop = () => {
      if (watchIdRef.current !== null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null;
      }
      clearRetry();
      startingRef.current = false;
      sendingRef.current = false;
      pendingRef.current = null;
    };
    const canTrack = Boolean(profile) && profile?.role === 'mover' &&
      (view === 'mover-booking-detail' || view === 'mover-tracking') &&
      Boolean(selectedMoverBookingId) && 'geolocation' in navigator;
    if (!canTrack) {
      stop(); bookingIdRef.current = null;
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

    const start = async () => {
      if (startingRef.current || watchIdRef.current !== null || cancelledRef.current) return;
      startingRef.current = true;
      try {
        const detail = await moverApi.getBookingDetail(bookingId);
        const booking = detail?.booking as BookingState | undefined;
        if (cancelledRef.current || bookingIdRef.current !== bookingId) return;
        if (!booking || !active(booking.status) || booking.payment_status !== 'paid') { stop(); return; }
        navigator.geolocation.getCurrentPosition(publish, error => console.warn('Initial mover GPS unavailable:', error.message), { enableHighAccuracy: true, maximumAge: 0, timeout: GPS_TIMEOUT_MS });
        watchIdRef.current = navigator.geolocation.watchPosition(
          publish,
          error => console.warn('Mover GPS unavailable:', error.message),
          { enableHighAccuracy: true, maximumAge: GPS_MAX_AGE_MS, timeout: GPS_TIMEOUT_MS },
        );
      } catch (error) { console.warn('Unable to start mover GPS tracking:', error); }
      finally { startingRef.current = false; }
    };
    const restart = () => {
      if (!cancelledRef.current) { stop(); void start(); }
    };
    const handleVisibility = () => { if (document.visibilityState === 'visible') restart(); };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('online', restart);
    window.addEventListener('pageshow', restart);
    void start();
    return () => {
      cancelledRef.current = true;
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', restart);
      window.removeEventListener('pageshow', restart);
      stop(); bookingIdRef.current = null;
    };
  }, [profile, view, selectedMoverBookingId]);
  return null;
}
