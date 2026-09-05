import { useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import { renterApi, type Booking } from '@/lib/Renter/renterApi';

const normalized = (value: string | null | undefined) => String(value ?? '').trim().toLowerCase().replace(/-/g, '_');

export default function RenterBookingChatRedirector() {
  const { profile } = useAuth();
  const { navigate, view } = useNav();
  const previous = useRef<Map<string, string>>(new Map());
  const initialized = useRef(false);
  const redirecting = useRef(false);

  useEffect(() => {
    if (!profile?.id || profile.role !== 'renter') return;
    let cancelled = false;

    const check = async () => {
      try {
        const bookings = await renterApi.getBookings(profile.id);
        if (cancelled) return;
        const next = new Map<string, string>();
        for (const booking of bookings) {
          const status = normalized(booking.status);
          next.set(booking.id, status);
          const before = previous.current.get(booking.id);
          if (initialized.current && before === 'pending' && status === 'confirmed' && booking.mover_id && !redirecting.current) {
            redirecting.current = true;
            navigate('chat', booking.mover_id);
            window.setTimeout(() => { redirecting.current = false; }, 1500);
            break;
          }
        }
        previous.current = next;
        initialized.current = true;
      } catch {
        // Dashboard remains usable if the background status check temporarily fails.
      }
    };

    void check();
    const timer = window.setInterval(() => void check(), 4000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [profile?.id, profile?.role, navigate]);

  // If the renter is already inside chat, ChatPage owns the conversation state.
  void view;
  return null;
}
