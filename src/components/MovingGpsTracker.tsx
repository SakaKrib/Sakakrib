import { useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import { protectedGet, protectedPost } from '@/lib/djangoLegacyApi';

interface BookingState {
  id: string;
  status: string | null;
  payment_status: string | null;
}

const active = (value: string | null | undefined) =>
  String(value ?? '').trim().toLowerCase().replace(/-/g, '_') === 'in_progress';

const TRACK_INTERVAL_MS = 5000;
const GPS_MAX_AGE_MS = 5000;
const GPS_TIMEOUT_MS = 20000;

/**
 * Publishes mover GPS through Django HTTPS. The server remains authoritative:
 * it verifies the assigned mover, payment, journey state and throttles writes.
 * Channels then fan accepted points out to every authorized tracking client.
 *
 * The watcher is kept alive across SPA navigation and is restarted when the
 * browser brings the page back online/visible. A normal Chrome tab cannot
 * guarantee GPS after the browser/OS kills the tab; native Android/iOS
 * background-location will be added at the app layer later.
 */
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
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      startingRef.current = false;
    };

    const canTrack =
      Boolean(profile) &&
      profile?.role === 'mover' &&
      view === 'mover-booking-detail' &&
      Boolean(selectedMoverBookingId) &&
      'geolocation' in navigator;

    if (!canTrack) {
      stop();
      bookingIdRef.current = null;
      return () => {
        cancelledRef.current = true;
        stop();
      };
    }

    const bookingId = selectedMoverBookingId!;
    bookingIdRef.current = bookingId;

    const publish = (position: GeolocationPosition) => {
      if (cancelledRef.current || bookingIdRef.current !== bookingId) return;

      const now = Date.now();
      if (now - lastSentAtRef.current < TRACK_INTERVAL_MS) return;

      // Reserve the send slot before awaiting the request so GPS callbacks
      // cannot create concurrent writes during a burst of browser updates.
      lastSentAtRef.current = now;

      void protectedPost(`/api/core/bookings/${encodeURIComponent(bookingId)}/tracking/`, {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy_meters: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
        speed_kph: position.coords.speed == null ? null : Math.max(0, position.coords.speed * 3.6),
        heading_degrees: position.coords.heading == null ? null : position.coords.heading,
      }).catch(error => {
        console.warn('Live GPS update was rejected:', error);
      });
    };

    const start = async () => {
      if (startingRef.current || watchIdRef.current !== null || cancelledRef.current) return;
      startingRef.current = true;

      try {
        const response = await protectedGet<{ booking?: BookingState }>(
          `/api/core/bookings/${encodeURIComponent(bookingId)}/detail/`
        );
        const booking = response?.booking;
        if (cancelledRef.current || bookingIdRef.current !== bookingId) return;
        if (!booking || !active(booking.status) || booking.payment_status !== 'paid') {
          stop();
          return;
        }

        // Take one immediate high-accuracy sample where possible, then keep
        // watchPosition active. The server still enforces the 5-second floor.
        navigator.geolocation.getCurrentPosition(publish, error => {
          console.warn('Initial mover GPS unavailable:', error.message);
        }, { enableHighAccuracy: true, maximumAge: 0, timeout: GPS_TIMEOUT_MS });

        watchIdRef.current = navigator.geolocation.watchPosition(
          publish,
          error => console.warn('Mover GPS unavailable:', error.message),
          {
            enableHighAccuracy: true,
            maximumAge: GPS_MAX_AGE_MS,
            timeout: GPS_TIMEOUT_MS,
          }
        );
      } catch (error) {
        console.warn('Unable to start mover GPS tracking:', error);
      } finally {
        startingRef.current = false;
      }
    };

    const restart = () => {
      if (cancelledRef.current) return;
      stop();
      void start();
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') restart();
    };

    const handleOnline = () => restart();
    const handlePageShow = () => restart();

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('online', handleOnline);
    window.addEventListener('pageshow', handlePageShow);

    void start();

    return () => {
      cancelledRef.current = true;
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('pageshow', handlePageShow);
      stop();
      bookingIdRef.current = null;
    };
  }, [profile, view, selectedMoverBookingId]);

  return null;
}
