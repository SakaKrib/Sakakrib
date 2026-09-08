import { useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import { moverApi } from '@/lib/Movers/moverApi';

interface BookingState { id: string; status: string | null; payment_status: string | null; }
interface PendingLocation { latitude: number; longitude: number; accuracy_meters: number | null; speed_kph: number | null; heading_degrees: number | null; }
const normalized = (value: string | null | undefined) => String(value ?? '').trim().toLowerCase().replace(/-/g, '_');
const active = (value: string | null | undefined) => normalized(value) === 'in_progress';
const paid = (value: string | null | undefined) => normalized(value) === 'paid';
const BOOKING_STATE_INTERVAL_MS = 5000;
const GPS_MAX_AGE_MS = 0;
const GPS_TIMEOUT_MS = 60000;
const RETRY_INTERVAL_MS = 5000;
const GPS_PROBE_INTERVAL_MS = 5000;

/** Publishes mover GPS through the canonical Django mover API. */
export default function MovingGpsTracker() {
  const { profile } = useAuth();
  const { selectedMoverBookingId, selectedMoverId } = useNav();
  const watchIdRef = useRef<number | null>(null);
  const gpsProbeTimerRef = useRef<number | null>(null);
  const bookingIdRef = useRef<string | null>(null);
  const lastSentAtRef = useRef(0);
  const cancelledRef = useRef(false);
  const pendingRef = useRef<PendingLocation | null>(null);
  const sendingRef = useRef(false);
  const retryTimerRef = useRef<number | null>(null);

  useEffect(() => {
    cancelledRef.current = false;
    const clearRetry = () => { if (retryTimerRef.current !== null) { window.clearTimeout(retryTimerRef.current); retryTimerRef.current = null; } };
    const clearGpsProbe = () => { if (gpsProbeTimerRef.current !== null) { window.clearInterval(gpsProbeTimerRef.current); gpsProbeTimerRef.current = null; } };
    const stop = () => {
      if (watchIdRef.current !== null && 'geolocation' in navigator) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; }
      clearRetry(); clearGpsProbe(); pendingRef.current = null; sendingRef.current = false;
    };

    const canTrack = Boolean(profile) && normalized(profile?.role) === 'mover' && 'geolocation' in navigator;
    if (!canTrack) {
      stop();
      bookingIdRef.current = null;
      return () => { cancelledRef.current = true; stop(); };
    }

    const sendPending = async (bookingId: string) => {
      if (cancelledRef.current || bookingIdRef.current !== bookingId || sendingRef.current) return;
      const location = pendingRef.current;
      if (!location || !navigator.onLine) return;
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
          retryTimerRef.current = window.setTimeout(() => { retryTimerRef.current = null; void sendPending(bookingId); }, RETRY_INTERVAL_MS);
        }
      } finally { sendingRef.current = false; }
    };

    const publish = (position: GeolocationPosition) => {
      const bookingId = bookingIdRef.current;
      if (cancelledRef.current || !bookingId) return;
      const rawAccuracy = position.coords.accuracy;
      const accuracy = Number.isFinite(rawAccuracy) && rawAccuracy >= 0 && rawAccuracy <= 10000 ? rawAccuracy : null;
      const devicePosition = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy_meters: accuracy,
        speed_kph: position.coords.speed == null ? null : Math.max(0, position.coords.speed * 3.6),
        heading_degrees: position.coords.heading == null ? null : position.coords.heading,
        timestamp: position.timestamp,
      };
      window.dispatchEvent(new CustomEvent('sakakrib:mover-gps-position', { detail: devicePosition }));
      pendingRef.current = {
        latitude: devicePosition.latitude,
        longitude: devicePosition.longitude,
        accuracy_meters: devicePosition.accuracy_meters,
        speed_kph: devicePosition.speed_kph,
        heading_degrees: devicePosition.heading_degrees,
      };
      void sendPending(bookingId);
    };

    const handleGpsError = (error: GeolocationPositionError) => { console.warn('Mover GPS unavailable:', error.code, error.message); };

    const probeGps = () => {
      if (cancelledRef.current || !bookingIdRef.current || !navigator.onLine) return;
      navigator.geolocation.getCurrentPosition(publish, handleGpsError, { enableHighAccuracy: true, maximumAge: GPS_MAX_AGE_MS, timeout: GPS_TIMEOUT_MS });
    };

    const startGps = () => {
      if (cancelledRef.current || watchIdRef.current !== null) return;
      watchIdRef.current = navigator.geolocation.watchPosition(
        publish,
        handleGpsError,
        { enableHighAccuracy: true, maximumAge: GPS_MAX_AGE_MS, timeout: GPS_TIMEOUT_MS }
      );
      probeGps();
      clearGpsProbe();
      gpsProbeTimerRef.current = window.setInterval(probeGps, GPS_PROBE_INTERVAL_MS);
    };

    const selectActiveBooking = async () => {
      if (cancelledRef.current) return;
      try {
        const bookings = await moverApi.getBookings();
        if (cancelledRef.current) return;
        const preferredId = selectedMoverBookingId || null;
        const preferred = preferredId ? bookings.find((booking) => booking.id === preferredId) : null;
        const candidate = preferred && active(preferred.status) && paid(preferred.payment_status)
          ? preferred
          : bookings.find((booking) => active(booking.status) && paid(booking.payment_status));
        const nextBookingId = candidate?.id ?? null;

        if (nextBookingId !== bookingIdRef.current) {
          stop();
          bookingIdRef.current = nextBookingId;
          if (nextBookingId) startGps();
        } else if (nextBookingId && watchIdRef.current === null) {
          startGps();
        }
      } catch (error) {
        console.warn('Unable to refresh mover active journey for GPS tracking:', error);
      }
    };

    const restart = () => { void selectActiveBooking(); };
    const handleVisibility = () => { if (document.visibilityState === 'visible') restart(); };
    const handleExplicitGpsRequest = () => { void selectActiveBooking(); };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('online', restart);
    window.addEventListener('pageshow', restart);
    window.addEventListener('sakakrib:request-mover-gps', handleExplicitGpsRequest);

    void selectActiveBooking();
    const stateTimer = window.setInterval(() => { void selectActiveBooking(); }, BOOKING_STATE_INTERVAL_MS);

    return () => {
      cancelledRef.current = true;
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', restart);
      window.removeEventListener('pageshow', restart);
      window.removeEventListener('sakakrib:request-mover-gps', handleExplicitGpsRequest);
      window.clearInterval(stateTimer);
      stop();
      bookingIdRef.current = null;
    };
  }, [profile, selectedMoverBookingId, selectedMoverId]);

  return null;
}
