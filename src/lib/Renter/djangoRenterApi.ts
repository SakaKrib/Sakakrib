import { djangoApi } from '@/lib/djangoApi';

export interface DjangoMoverBookingRequest {
  mover_id: string;
  pickup_address: string;
  pickup_latitude?: number;
  pickup_longitude?: number;
  dropoff_address?: string;
  dropoff_latitude?: number;
  dropoff_longitude?: number;
  moving_date: string;
  preferred_payment_method?: string;
  payment_method?: string;
  listing_id?: string;
  distance_km?: number;
}

export interface DjangoBookingResponse {
  id: string;
  renter_id?: string;
  mover_id?: string;
  listing_id?: string | null;
  pickup_address?: string | null;
  dropoff_address?: string | null;
  moving_date?: string | null;
  booking_amount?: string | number | null;
  commission_amount?: string | number | null;
  total_amount?: string | number | null;
  status: string;
  payment_status: string;
  payment_method?: string | null;
  distance_km?: number | null;
  rate_per_km_kes?: number | null;
  base_rate_kes?: number | null;
  pickup_latitude?: number | null;
  pickup_longitude?: number | null;
  dropoff_latitude?: number | null;
  dropoff_longitude?: number | null;
  requested_at?: string | null;
  request_expires_at?: string | null;
  confirmed_at?: string | null;
  scheduled_start_at?: string | null;
  scheduled_end_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
  cancellation_details?: string | null;
  tracking_number?: string | null;
  renter_confirmed_delivery_at?: string | null;
  mover_confirmed_delivery_at?: string | null;
  contact_released_at?: string | null;
  dispute_status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
}

export interface DjangoMoverQuote {
  mover_id?: string;
  distance_km: number;
  base_rate_kes: number;
  rate_per_km_kes: number;
  mover_charge_kes?: number;
  operational_markup_rate?: number;
  operational_markup_kes?: number;
  commission_rate?: number;
  commission_kes?: number;
  renter_total_kes: number;
  net_mover_payable_kes?: number;
  currency?: string;
  [key: string]: unknown;
}

export interface DjangoInvoice {
  id: string;
  invoice_number: string;
  landlord_id: string;
  renter_user_id: string;
  renter_assoc_id: string;
  listing_id: string;
  unit_id: string;
  billing_period_start: string;
  billing_period_end: string;
  due_date: string;
  amount_kes: number;
  currency: string;
  status: string;
  payment_method_id: string | null;
  payment_destination_snapshot: Record<string, unknown> | null;
  paid_at: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
  amount?: number;
  total_amount?: number;
}

const mapInvoice = (invoice: DjangoInvoice): DjangoInvoice => ({
  ...invoice,
  amount: invoice.amount_kes,
  total_amount: invoice.amount_kes,
});

export const djangoRenterApi = {
  dashboard: () => djangoApi.get('/api/core/renter/dashboard/'),
  invoices: async () => {
    const rows = await djangoApi.get<DjangoInvoice[]>('/api/core/renter/invoices/');
    return (rows ?? []).map(mapInvoice);
  },
  invoice: async (invoiceId: string) =>
    mapInvoice(await djangoApi.get<DjangoInvoice>(`/api/core/renter/invoices/${invoiceId}/`)),
  movers: (params?: URLSearchParams) =>
    djangoApi.get(`/api/core/movers/${params ? `?${params.toString()}` : ''}`),
  mover: (moverId: string) => djangoApi.get(`/api/core/movers/${moverId}/`),
  bookings: () => djangoApi.get<DjangoBookingResponse[]>('/api/core/bookings/'),
  booking: (bookingId: string) => djangoApi.get<DjangoBookingResponse>(`/api/core/bookings/${bookingId}/detail/`),
  requestMoverBooking: (payload: DjangoMoverBookingRequest) =>
    djangoApi.post<DjangoBookingResponse>('/api/core/bookings/request/', payload),
  quote: (moverId: string, distanceKm: number) =>
    djangoApi.post<DjangoMoverQuote>('/api/core/movers/quote/', {
      mover_id: moverId,
      distance_km: distanceKm,
    }),
  respondToBooking: (bookingId: string, decision: 'accept' | 'reject', reason?: string) =>
    djangoApi.post<DjangoBookingResponse>(`/api/core/bookings/${bookingId}/respond/`, { decision, reason }),
  proposeSchedule: (bookingId: string, startsAt: string, endsAt: string) =>
    djangoApi.post<DjangoBookingResponse>(`/api/core/bookings/${bookingId}/schedule/propose/`, {
      starts_at: startsAt,
      ends_at: endsAt,
    }),
  confirmSchedule: (bookingId: string) =>
    djangoApi.post<DjangoBookingResponse>(`/api/core/bookings/${bookingId}/schedule/confirm/`),
  startMove: (bookingId: string) =>
    djangoApi.post<DjangoBookingResponse>(`/api/core/bookings/${bookingId}/start/`),
  cancelBooking: (bookingId: string, reasonCode: string, reasonText = '') =>
    djangoApi.post<DjangoBookingResponse>(`/api/core/bookings/${bookingId}/cancel/`, {
      reason_code: reasonCode,
      reason_text: reasonText,
    }),
  confirmDelivery: (bookingId: string) =>
    djangoApi.post<DjangoBookingResponse>(`/api/core/bookings/${bookingId}/delivery/confirm/`),
  dispute: (bookingId: string, reason: string) =>
    djangoApi.post<DjangoBookingResponse>(`/api/core/bookings/${bookingId}/disputes/`, { description: reason }),
  tracking: (bookingId: string) =>
    djangoApi.get(`/api/core/bookings/${bookingId}/tracking/`),
  latestTracking: (bookingId: string) =>
    djangoApi.get(`/api/core/bookings/${bookingId}/tracking/latest/`),
  movingInvoices: (bookingId?: string) =>
    djangoApi.get(`/api/core/moving-invoices/${bookingId ? `?booking_id=${encodeURIComponent(bookingId)}` : ''}`),
  paymentSubmissions: (invoiceId: string) =>
    djangoApi.get(`/api/core/renter/invoices/${invoiceId}/submissions/`),
  submitRentPayment: (invoiceId: string, transactionReference: string, paymentMethod?: string, paymentDate?: string) =>
    djangoApi.post(`/api/core/invoices/${invoiceId}/submit-payment/`, {
      transaction_reference: transactionReference.trim(),
      payment_method: paymentMethod,
      payment_date: paymentDate,
    }),
  paymentDestination: (paymentMethodId: string, unitId: string) =>
    djangoApi.post('/api/core/renter/payment-destination/', {
      payment_method_id: paymentMethodId,
      unit_id: unitId,
    }),
  rentSummary: (associationId: string) =>
    djangoApi.post('/api/core/renter/rent-summary/', { renter_assoc_id: associationId }),
  paymentHistory: (associationId: string) =>
    djangoApi.post('/api/core/renter/payment-history/', { assoc_id: associationId }),
  scheduleAvailability: (bookingId: string, from: string, to: string) =>
    djangoApi.post('/api/core/renter/mover-schedule-availability/', { booking_id: bookingId, from, to }),
  notifications: () => djangoApi.get('/api/core/renter-notifications/'),
};
