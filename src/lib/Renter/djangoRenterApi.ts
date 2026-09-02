/** @deprecated Use the canonical renter API facade. */
export { renterApi as djangoRenterApi } from '@/lib/Renter/renterApi';
export type {
  Booking,
  MoverQuoteResponse,
  RentInvoice,
  MovingInvoice,
  RentPaymentSubmission,
  RenterAssociation,
  RenterUnit,
  RenterProperty,
  RenterDashboardResponse,
  RenterCalendarResponse,
  RenterNotificationsResponse,
  RenterChatResponse,
  MoverScheduleAvailability,
  RequestMoverBookingInput,
  RequestMoverBookingResponse,
} from '@/lib/Renter/renterApi';
