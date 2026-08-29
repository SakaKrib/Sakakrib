import { protectedGet, protectedPost } from '@/lib/protectedApi';

export interface MoverScheduleAvailability {
  booking_id: string;
  mover_id: string;
  working_days: string[] | null;
  start_time: string | null;
  end_time: string | null;
  blocked_intervals: Array<{
    starts_at: string;
    ends_at: string;
    status: string | null;
  }>;
}

export const renterApi = {
  // Dashboard
  getDashboard: () =>
    protectedGet<RenterDashboardResponse>(
      '/rest/v1/renter/dashboard'
    ),

  // Rent / invoices
  getInvoices: () =>
    protectedGet<RentInvoice[]>(
      '/rest/v1/renter/invoices'
    ),

  getInvoice: (id: string) =>
    protectedGet<RentInvoice>(
      `/rest/v1/renter/invoices/${id}`
    ),

  // Moving / bookings
  getBookings: () =>
    protectedGet<Booking[]>(
      '/rest/v1/renter/bookings'
    ),

  getBooking: (id: string) =>
    protectedGet<Booking>(
      `/rest/v1/renter/bookings/${id}`
    ),

  // Calendar
  getCalendar: () =>
    protectedGet<RenterCalendarResponse>(
      '/rest/v1/renter/calendar'
    ),

  getMoverScheduleAvailability: (
    bookingId: string,
    from: string,
    to: string,
  ) =>
    protectedPost<MoverScheduleAvailability>(
      '/rest/v1/rpc/get_mover_schedule_availability',
      {
        p_booking_id: bookingId,
        p_from: from,
        p_to: to,
      },
    ),

  // Notifications
  getNotifications: () =>
    protectedGet<RenterNotificationsResponse>(
      '/rest/v1/renter/notifications'
    ),

  // Chat
  getChat: () =>
    protectedGet<RenterChatResponse>(
      '/rest/v1/renter/chat'
    ),
};