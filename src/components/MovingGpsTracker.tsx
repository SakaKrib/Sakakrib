import { useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import { moverApi } from '@/lib/Movers/moverApi';
import { getCurrentPosition, isLocationSupported, watchPosition, type DevicePosition, type LocationError } from '@/lib/location';

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
  const stopWatchRef = useRef<(() => void) | null>(null);
  const startingRef = useRef(false);
  // Set when the mover denied location. Background timers must not keep re-prompting; only an
  // explicit tap (the 'sakakrib:request-mover-gps' event) clears it.
  const blockedRef = useRef(false);
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
      if (stopWatchRef.current) { stopWatchRef.current(); stopWatchRef.current = null; }
      startingRef.current = false;
      clearRetry(); clearGpsProbe(); pendingRef.current = null; sendingRef.current = false;
    };

    const canTrack = Boolean(profile) && normalized(profile?.role) === 'mover' && isLocationSupported();
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

    const publish = (position: DevicePosition) => {
      const bookingId = bookingIdRef.current;
      if (cancelledRef.current || !bookingId) return;
      const rawAccuracy = position.accuracy ?? NaN;
      const accuracy = Number.isFinite(rawAccuracy) && rawAccuracy >= 0 && rawAccuracy <= 10000 ? rawAccuracy : null;
      const devicePosition = {
        latitude: position.latitude,
        longitude: position.longitude,
        accuracy_meters: accuracy,
        speed_kph: position.speed == null ? null : Math.max(0, position.speed * 3.6),
        heading_degrees: position.heading == null ? null : position.heading,
        timestamp: position.timestamp,
        bookingId,
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

    const handleGpsError = (error: LocationError) => {
      console.warn('Mover GPS unavailable:', error.code, error.message);
      if (error.code === 'permission_denied') blockedRef.current = true;
      // Lets the UI tell the mover why renters cannot see them (denied, GPS off, ...).
      window.dispatchEvent(new CustomEvent('sakakrib:mover-gps-error', { detail: { code: error.code, message: error.message } }));
    };

    const probeGps = () => {
      if (cancelledRef.current || !bookingIdRef.current || !navigator.onLine) return;
      void getCurrentPosition({ enableHighAccuracy: true, maximumAge: GPS_MAX_AGE_MS, timeout: GPS_TIMEOUT_MS }).then(publish).catch(handleGpsError);
    };

    const startGps = () => {
      if (cancelledRef.current || stopWatchRef.current || startingRef.current || blockedRef.current) return;
      startingRef.current = true;
      // First call asks for location permission (system dialog in the app).
      void watchPosition(publish, handleGpsError, { enableHighAccuracy: true, maximumAge: GPS_MAX_AGE_MS, timeout: GPS_TIMEOUT_MS })
        .then((stopWatching) => {
          startingRef.current = false;
          if (cancelledRef.current || !bookingIdRef.current) { stopWatching(); return; }
          blockedRef.current = false;
          stopWatchRef.current = stopWatching;
          probeGps();
          clearGpsProbe();
          gpsProbeTimerRef.current = window.setInterval(probeGps, GPS_PROBE_INTERVAL_MS);
        })
        .catch((error: LocationError) => { startingRef.current = false; handleGpsError(error); });
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
        } else if (nextBookingId && stopWatchRef.current === null) {
          startGps();
        }
      } catch (error) {
        console.warn('Unable to refresh mover active journey for GPS tracking:', error);
      }
    };

    const restart = () => { void selectActiveBooking(); };
    const handleVisibility = () => { if (document.visibilityState === 'visible') restart(); };
    const handleExplicitGpsRequest = () => {
      blockedRef.current = false;
      if (bookingIdRef.current && stopWatchRef.current !== null) {
        probeGps();
        return;
      }
      void selectActiveBooking();
    };

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
