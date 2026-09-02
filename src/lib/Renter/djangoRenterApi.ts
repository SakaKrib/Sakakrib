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
  payment_method: string;
  listing_id?: string;
  notes?: string;
}

export interface DjangoBookingResponse {
  id: string;
  status: string;
  payment_status: string;
  payment_method?: string | null;
  moving_date?: string | null;
  booking_amount?: string | number | null;
  commission_amount?: string | number | null;
  total_amount?: string | number | null;
  pickup_address?: string | null;
  dropoff_address?: string | null;
  listing_id?: string | null;
}

export const djangoRenterApi = {
  dashboard: () => djangoApi.get<unknown>('/api/core/renter/dashboard/'),
  invoices: () => djangoApi.get<unknown>('/api/core/renter/invoices/'),
  invoice: (invoiceId: string) => djangoApi.get<unknown>(`/api/core/renter/invoices/${invoiceId}/`),
  movers: (params?: URLSearchParams) => djangoApi.get<unknown>(`/api/core/movers/${params ? `?${params.toString()}` : ''}`),
  mover: (moverId: string) => djangoApi.get<unknown>(`/api/core/movers/${moverId}/`),
  bookings: () => djangoApi.get<DjangoBookingResponse[]>('/api/core/bookings/'),
  booking: (bookingId: string) => djangoApi.get<DjangoBookingResponse>(`/api/core/bookings/${bookingId}/`),
  requestMoverBooking: (payload: DjangoMoverBookingRequest) =>
    djangoApi.post<DjangoBookingResponse>('/api/core/bookings/request/', payload),
  respondToBooking: (bookingId: string, response: string) =>
    djangoApi.post<DjangoBookingResponse>(`/api/core/bookings/${bookingId}/respond/`, { response }),
  proposeSchedule: (bookingId: string, payload: Record<string, unknown>) =>
    djangoApi.post<DjangoBookingResponse>(`/api/core/bookings/${bookingId}/schedule/propose/`, payload),
  confirmSchedule: (bookingId: string, payload?: Record<string, unknown>) =>
    djangoApi.post<DjangoBookingResponse>(`/api/core/bookings/${bookingId}/schedule/confirm/`, payload),
  startMove: (bookingId: string) =>
    djangoApi.post<DjangoBookingResponse>(`/api/core/bookings/${bookingId}/start/`),
  confirmDelivery: (bookingId: string) =>
    djangoApi.post<DjangoBookingResponse>(`/api/core/bookings/${bookingId}/delivery/confirm/`),
  dispute: (bookingId: string, reason: string) =>
    djangoApi.post<DjangoBookingResponse>(`/api/core/bookings/${bookingId}/dispute/`, { reason }),
  tracking: (bookingId: string) =>
    djangoApi.get<unknown>(`/api/core/bookings/${bookingId}/tracking/`),
};
