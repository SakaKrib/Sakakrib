import { protectedGet, protectedPost } from '@/lib/djangoApi';

export interface RenterAssociation {
  id: string; renter_user_id: string | null; unit_id: string; landlord_id: string; status: string;
  rent_amount: number | null; lease_start: string | null; lease_end: string | null;
}
export interface RenterUnit {
  id: string; listing_id: string; unit_number: string; unit_type: string; rent: number; deposit_amount: number;
  size: string | null; beds: number; baths: number; availability: string; description: string | null;
  rent_due_day: number; rent_paid_in_advance: boolean; rent_paid_through_month: string | null;
}
export interface RenterProperty { id: string; title: string; city: string; county: string; address: string | null; cover_image_url: string | null; }
export interface RentPaymentDestination { provider?: string | null; display_name?: string | null; payment_method?: string | null; mpesa_method?: string | null; paybill_number?: string | null; paybill_account?: string | null; till_number?: string | null; [key: string]: unknown; }
export interface RentInvoice {
  id: string; invoice_number: string; landlord_id?: string; renter_user_id: string; renter_assoc_id: string; listing_id: string; unit_id: string;
  billing_period_start: string; billing_period_end: string; due_date: string; amount_kes: number; currency: string; status: string;
  payment_method_id: string | null; payment_destination_snapshot: RentPaymentDestination | null; paid_at: string | null;
  confirmed_by: string | null; confirmed_at: string | null; created_at: string; updated_at: string; amount?: number | null; total_amount?: number | null;
}
export interface MovingInvoice {
  id: string; booking_id: string; invoice_number: string; renter_id: string; mover_id: string;
  amount_kes: number; currency: 'KES' | string; status: string; payment_provider: string | null;
  provider_reference: string | null; provider_transaction_id: string | null; paid_at: string | null; released_at: string | null;
  mover_name_snapshot: string; mover_phone_snapshot: string | null; vehicle_type_snapshot: string | null;
  number_plate_snapshot: string | null; mover_profile_photo_snapshot: string | null; created_at: string; updated_at: string;
}
export interface RentPaymentSubmission {
  id: string; invoice_id: string; renter_user_id: string; landlord_id: string; renter_assoc_id: string; unit_id: string;
  transaction_reference: string; status: string; submitted_at: string; confirmed_by: string | null; confirmed_at: string | null;
  rejection_reason: string | null; created_at: string; updated_at: string;
}
export interface Booking {
  id: string; renter_id: string; mover_id: string; listing_id: string | null; pickup_address: string; dropoff_address: string;
  moving_date: string; booking_amount: number; commission_amount: number; total_amount: number; status: string; payment_status: string;
  payment_method: string | null; distance_km: number | null; rate_per_km_kes: number | null; base_rate_kes: number | null;
  pickup_latitude: number | null; pickup_longitude: number | null; dropoff_latitude: number | null; dropoff_longitude: number | null;
  requested_at: string | null; request_expires_at: string | null; confirmed_at: string | null; tracking_number: string | null;
  last_known_latitude: number | null; last_known_longitude: number | null; last_location_at: string | null; scheduled_start_at: string | null;
  scheduled_end_at: string | null; started_at: string | null; renter_confirmed_delivery_at: string | null; mover_confirmed_delivery_at: string | null;
  contact_released_at: string | null; dispute_status: string | null; completed_at: string | null; cancelled_at: string | null;
  cancellation_reason: string | null; cancellation_details: string | null; created_at: string | null; updated_at: string | null;
}
export interface RequestMoverBookingInput {
  moverId: string; pickupAddress: string; dropoffAddress: string; pickupLatitude: number; pickupLongitude: number;
  dropoffLatitude: number; dropoffLongitude: number; distanceKm: number; listingId?: string | null;
}
export interface RequestMoverBookingResponse {
  booking_id: string; conversation_id: string; status: 'pending' | string; request_expires_at: string;
  quote: { base_rate_kes?: number; rate_per_km_kes?: number; distance_km?: number; platform_fee_kes?: number; renter_total_kes?: number; mover_net_kes?: number; [key: string]: unknown; };
}
export interface MoverQuoteResponse {
  moverId: string; distanceKm: number; baseRateKes: number; ratePerKmKes: number;
  moverChargeKes: number; operationalMarkupRate: number; operationalMarkupKes: number;
  commissionRate: number; commissionKes: number; renterTotalKes: number; netMoverPayableKes: number; currency: string;
}
export interface RenterDashboardResponse { association: RenterAssociation | null; unit: RenterUnit | null; property: RenterProperty | null; invoices: RentInvoice[]; bookings: Booking[]; }
export interface RenterCalendarResponse { invoices: RentInvoice[]; bookings: Booking[]; }
export interface RenterNotificationsResponse { notifications: Array<{ id: string; renter_user_id: string; renter_assoc_id: string | null; landlord_id: string | null; notification_type: string; title: string; body: string; action_type: string | null; action_payload: Record<string, unknown>; read_at: string | null; created_at: string; }>; }
export interface RenterChatResponse { messages: unknown[]; }
export interface MoverScheduleAvailability { booking_id: string; mover_id: string; working_days: string[] | null; start_time: string | null; end_time: string | null; blocked_intervals: Array<{ starts_at: string; ends_at: string; status: string | null }>; }

const mapInvoice = (invoice: RentInvoice): RentInvoice => ({
  ...invoice,
  amount: invoice.amount_kes,
  total_amount: invoice.amount_kes,
});

const mapQuote = (quote: Record<string, unknown>): MoverQuoteResponse => ({
  moverId: String(quote.moverId ?? quote.mover_id ?? ''),
  distanceKm: Number(quote.distanceKm ?? quote.distance_km ?? 0),
  baseRateKes: Number(quote.baseRateKes ?? quote.base_rate_kes ?? 0),
  ratePerKmKes: Number(quote.ratePerKmKes ?? quote.rate_per_km_kes ?? 0),
  moverChargeKes: Number(quote.moverChargeKes ?? quote.mover_charge_kes ?? 0),
  operationalMarkupRate: Number(quote.operationalMarkupRate ?? quote.operational_markup_rate ?? 0),
  operationalMarkupKes: Number(quote.operationalMarkupKes ?? quote.operational_markup_kes ?? 0),
  commissionRate: Number(quote.commissionRate ?? quote.commission_rate ?? quote.platform_commission_rate ?? 0),
  commissionKes: Number(quote.commissionKes ?? quote.commission_kes ?? quote.platform_fee_kes ?? 0),
  renterTotalKes: Number(quote.renterTotalKes ?? quote.renter_total_kes ?? 0),
  netMoverPayableKes: Number(quote.netMoverPayableKes ?? quote.net_mover_payable_kes ?? quote.mover_net_kes ?? 0),
  currency: String(quote.currency ?? 'KES'),
});

const mapBookingRequest = (result: Record<string, unknown>): RequestMoverBookingResponse => {
  const rawQuote = (result.quote ?? {}) as Record<string, unknown>;
  return {
    booking_id: String(result.booking_id ?? ''),
    conversation_id: String(result.conversation_id ?? ''),
    status: String(result.status ?? 'pending'),
    request_expires_at: String(result.request_expires_at ?? ''),
    quote: {
      ...rawQuote,
      base_rate_kes: Number(rawQuote.base_rate_kes ?? rawQuote.baseRateKes ?? 0),
      rate_per_km_kes: Number(rawQuote.rate_per_km_kes ?? rawQuote.ratePerKmKes ?? 0),
      distance_km: Number(rawQuote.distance_km ?? rawQuote.distanceKm ?? 0),
      platform_fee_kes: Number(rawQuote.platform_fee_kes ?? rawQuote.platformFeeKes ?? 0),
      renter_total_kes: Number(rawQuote.renter_total_kes ?? rawQuote.renterTotalKes ?? 0),
      mover_net_kes: Number(rawQuote.mover_net_kes ?? rawQuote.netMoverPayableKes ?? 0),
    },
  };
};

export const renterApi = {
  getDashboard: async (userId?: string): Promise<RenterDashboardResponse> => {
    if (!userId) throw new Error('Authenticated renter identity is required.');
    return protectedGet<RenterDashboardResponse>('/api/core/renter/dashboard/');
  },

  getInvoices: async (userId?: string): Promise<RentInvoice[]> => {
    if (!userId) throw new Error('Authenticated renter identity is required.');
    const invoices = await protectedGet<RentInvoice[]>('/api/core/renter/invoices/');
    return (invoices ?? []).map(mapInvoice);
  },

  getInvoice: async (id: string): Promise<RentInvoice> => {
    const invoice = await protectedGet<RentInvoice>(`/api/core/renter/invoices/${encodeURIComponent(id)}/`);
    return mapInvoice(invoice);
  },

  getMovingInvoice: async (bookingId: string): Promise<MovingInvoice | null> => {
    if (!bookingId) return null;
    const invoices = await protectedGet<MovingInvoice[]>('/api/core/moving-invoices/');
    return (invoices ?? []).find((invoice) => invoice.booking_id === bookingId) ?? null;
  },

  getPaymentSubmissions: async (invoiceId: string): Promise<RentPaymentSubmission[]> => {
    return protectedGet<RentPaymentSubmission[]>(`/api/core/renter/invoices/${encodeURIComponent(invoiceId)}/submissions/`);
  },

  submitRentPayment: async (invoiceId: string, transactionReference: string) => {
    const reference = transactionReference.trim();
    if (!reference) throw new Error('Transaction ID is required.');
    return protectedPost<{ success: boolean; submission_id?: string; invoice_id?: string; status?: string }>(
      `/api/core/invoices/${encodeURIComponent(invoiceId)}/submit-payment/`,
      { transaction_reference: reference },
    );
  },

  getPaymentDestination: (paymentMethodId: string, unitId: string) =>
    protectedPost<RentPaymentDestination | null>('/api/core/renter/payment-destination/', {
      payment_method_id: paymentMethodId,
      unit_id: unitId,
    }),

  getRentSummary: (associationId: string) =>
    protectedPost<Record<string, unknown>>('/api/core/renter/rent-summary/', {
      renter_assoc_id: associationId,
    }),

  getPaymentHistory: (associationId: string) =>
    protectedPost<Array<{ id: string; amount_kes: number; period_year: number; period_month: number; status: string; payment_provider: string | null; payment_method: string | null; mpesa_receipt: string | null; paid_at: string | null; created_at: string }>>(
      '/api/core/renter/payment-history/',
      { assoc_id: associationId },
    ),

  getBookings: async (userId?: string): Promise<Booking[]> => {
    if (!userId) throw new Error('Authenticated renter identity is required.');
    const bookings = await protectedGet<Booking[]>('/api/core/bookings/');
    return (bookings ?? []).filter((booking) => booking.renter_id === userId);
  },

  getBooking: async (id: string): Promise<Booking> => {
    return protectedGet<Booking>(`/api/core/bookings/${encodeURIComponent(id)}/`);
  },

  getMoverQuote: async (moverId: string, distanceKm: number): Promise<MoverQuoteResponse> => {
    if (!moverId) throw new Error('Mover is required.');
    if (!Number.isFinite(distanceKm) || distanceKm < 0) throw new Error('Invalid route distance.');
    const result = await protectedPost<Record<string, unknown>>('/api/core/movers/quote/', {
      mover_id: moverId,
      distance_km: distanceKm,
    });
    return mapQuote(result);
  },

  requestMoverBooking: async (input: RequestMoverBookingInput): Promise<RequestMoverBookingResponse> => {
    const pickupAddress = input.pickupAddress.trim();
    const dropoffAddress = input.dropoffAddress.trim();
    if (!input.moverId) throw new Error('Mover is required.');
    if (!pickupAddress) throw new Error('Pickup address is required.');
    if (!dropoffAddress) throw new Error('Drop-off address is required.');
    if (!Number.isFinite(input.pickupLatitude) || !Number.isFinite(input.pickupLongitude) || !Number.isFinite(input.dropoffLatitude) || !Number.isFinite(input.dropoffLongitude)) {
      throw new Error('Please select valid pickup and drop-off locations.');
    }
    if (!Number.isFinite(input.distanceKm) || input.distanceKm < 0) throw new Error('Invalid route distance.');
    const result = await protectedPost<Record<string, unknown>>('/api/core/bookings/request/', {
      mover_id: input.moverId,
      pickup_address: pickupAddress,
      dropoff_address: dropoffAddress,
      pickup_latitude: input.pickupLatitude,
      pickup_longitude: input.pickupLongitude,
      dropoff_latitude: input.dropoffLatitude,
      dropoff_longitude: input.dropoffLongitude,
      distance_km: input.distanceKm,
      listing_id: input.listingId ?? null,
    });
    if (!result?.booking_id) throw new Error('The mover request was not created.');
    return mapBookingRequest(result);
  },

  getCalendar: async (userId?: string): Promise<RenterCalendarResponse> => {
    const [invoices, bookings] = await Promise.all([renterApi.getInvoices(userId), renterApi.getBookings(userId)]);
    return { invoices, bookings };
  },

  getMoverScheduleAvailability: (bookingId: string, from: string, to: string) =>
    protectedPost<MoverScheduleAvailability>('/api/core/renter/mover-schedule-availability/', {
      booking_id: bookingId,
      from,
      to,
    }),

  getNotifications: async (userId?: string): Promise<RenterNotificationsResponse> => {
    if (!userId) throw new Error('Authenticated renter identity is required.');
    const response = await protectedGet<RenterNotificationsResponse>('/api/core/renter-notifications/');
    return response;
  },

  getChat: async (): Promise<RenterChatResponse> => ({ messages: [] }),
};
