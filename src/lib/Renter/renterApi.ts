import { protectedGet } from '@/lib/protectedApi';

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