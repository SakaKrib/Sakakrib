import { useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import { moverApi } from '@/lib/Movers/moverApi';

interface BookingState { id: string; status: string | null; payment_status: string | null; }
const active = (value: string | null | undefined) => String(value ?? '').trim().toLowerCase().replace(/-/g, '_') === 'in_progress';
const TRACK_INTERVAL_MS = 5000;
const GPS_MAX_AGE_MS = 5000;
const GPS_TIMEOUT_MS = 20000;

/** Publishes mover GPS through the canonical Django mover API. */
export default function MovingGpsTracker() {
  const { profile } = useAuth();
  const { view, selectedMoverBookingId } = useNav();
  const watchIdRef = useRef<number | null>(null);
  const bookingIdRef = useRef<string | null>(null);
  const lastSentAtRef = useRef(0);
  const startingRef = useRef(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    const stop = () => {
      if (watchIdRef.current !== null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null;
      }
      startingRef.current = false;
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

    const publish = (position: GeolocationPosition) => {
      if (cancelledRef.current || bookingIdRef.current !== bookingId) return;
      const now = Date.now();
      if (now - lastSentAtRef.current < TRACK_INTERVAL_MS) return;
      lastSentAtRef.current = now;
      void moverApi.recordLocation(bookingId, {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy_meters: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
        speed_kph: position.coords.speed == null ? null : Math.max(0, position.coords.speed * 3.6),
        heading_degrees: position.coords.heading == null ? null : position.coords.heading,
      }).catch(error => console.warn('Live GPS update was rejected:', error));
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
    const restart = () => { if (!cancelledRef.current) { stop(); void start(); } };
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
