import { useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import { protectedGet, protectedPost } from '@/lib/protectedApi';

interface BookingState { id: string; status: string | null; payment_status: string | null; }

const active = (value: string | null | undefined) => String(value ?? '').trim().toLowerCase().replace(/-/g, '_') === 'in_progress';

/**
 * Publishes mover GPS through Django HTTPS. The server remains authoritative:
 * it verifies the assigned mover, payment, journey state and throttles writes.
 * Channels then fan accepted points out to the renter in real time.
 */
export default function MovingGpsTracker() {
  const { profile } = useAuth();
  const { view, selectedMoverBookingId } = useNav();
  const watchIdRef = useRef<number | null>(null);
  const lastSentAtRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const stop = () => {
      if (watchIdRef.current !== null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };

    if (!profile || profile.role !== 'mover' || view !== 'mover-booking-detail' || !selectedMoverBookingId || !('geolocation' in navigator)) {
      stop();
      return () => { cancelled = true; stop(); };
    }

    const bookingId = selectedMoverBookingId;
    const start = async () => {
      try {
        const response = await protectedGet<{ booking?: BookingState }>(`/api/core/bookings/${encodeURIComponent(bookingId)}/detail/`);
        const booking = response?.booking;
        if (cancelled || !booking || !active(booking.status) || booking.payment_status !== 'paid') return;

        const publish = (position: GeolocationPosition) => {
          if (cancelled) return;
          const now = Date.now();
          if (now - lastSentAtRef.current < 5000) return;
          lastSentAtRef.current = now;
          void protectedPost(`/api/core/bookings/${encodeURIComponent(bookingId)}/tracking/`, {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy_meters: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
            speed_kph: position.coords.speed == null ? null : Math.max(0, position.coords.speed * 3.6),
            heading_degrees: position.coords.heading == null ? null : position.coords.heading,
          }).catch(error => console.warn('Live GPS update was rejected:', error));
        };

        watchIdRef.current = navigator.geolocation.watchPosition(publish, error => {
          console.warn('Mover GPS unavailable:', error.message);
        }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
      } catch (error) {
        console.warn('Unable to start mover GPS tracking:', error);
      }
    };

    void start();
    return () => { cancelled = true; stop(); };
  }, [profile, view, selectedMoverBookingId]);

  return null;
}
