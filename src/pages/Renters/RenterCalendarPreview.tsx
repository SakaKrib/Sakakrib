import { useMemo } from 'react';
import { useNav } from '@/context/NavContext';
import type { Booking } from '@/lib/Renter/renterApi';
import MoverCalendar from '@/pages/Movers/MoverCalendar';
import type { MoverScheduleEvent } from '@/lib/Movers/moverApi';

interface Props { bookings: Booking[]; }

const activeStatuses = new Set(['PENDING', 'CONFIRMED', 'ACCEPTED', 'IN_PROGRESS', 'IN-PROGRESS', 'ONGOING']);

export default function RenterCalendarPreview({ bookings }: Props) {
  const { navigate } = useNav();
  const schedule = useMemo<MoverScheduleEvent[]>(() => bookings
    .filter((booking) => booking.moving_date && activeStatuses.has(String(booking.status ?? '').trim().toUpperCase()))
    .map((booking) => {
      const start = booking.scheduled_start_at || booking.moving_date;
      const end = booking.scheduled_end_at || new Date(new Date(start).getTime() + 2 * 60 * 60 * 1000).toISOString();
      const status = String(booking.status ?? '').trim().toUpperCase();
      return {
        id: `renter-${booking.id}`,
        mover_id: booking.mover_id,
        booking_id: booking.id,
        starts_at: start,
        ends_at: end,
        status: ['PENDING', 'ACCEPTED'].includes(status) ? 'TENTATIVE' : 'CONFIRMED',
        title: 'Moving service',
        created_at: booking.created_at,
        updated_at: booking.updated_at,
      };
    }), [bookings]);

  return <MoverCalendar schedule={schedule} onOpen={(bookingId) => {
    const booking = bookings.find((item) => item.id === bookingId);
    if (!booking) return;
    const status = String(booking.status ?? '').trim().toLowerCase();
    if (['completed', 'cancelled', 'canceled'].includes(status)) navigate('renter-moving-history');
    else navigate('mover-tracking', bookingId);
  }} />;
}
