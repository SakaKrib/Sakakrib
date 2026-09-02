import { djangoApi } from '@/lib/djangoApi';

export interface RenterAssociation { id: string; renter_user_id: string | null; unit_id: string; landlord_id: string; status: string; rent_amount: number | null; lease_start: string | null; lease_end: string | null; }
export interface RenterUnit { id: string; listing_id: string; unit_number: string; unit_type: string; rent: number; deposit_amount: number; size: string | null; beds: number; baths: number; availability: string; description: string | null; rent_due_day: number; rent_paid_in_advance: boolean; rent_paid_through_month: string | null; }
export interface RenterProperty { id: string; title: string; city: string; county: string; address: string | null; cover_image_url: string | null; }
export interface RentPaymentDestination { provider?: string | null; display_name?: string | null; payment_method?: string | null; mpesa_method?: string | null; paybill_number?: string | null; paybill_account?: string | null; till_number?: string | null; [key: string]: unknown; }
export interface RentInvoice { id: string; invoice_number: string; landlord_id?: string; renter_user_id: string; renter_assoc_id: string; listing_id: string; unit_id: string; billing_period_start: string; billing_period_end: string; due_date: string; amount_kes: number; currency: string; status: string; payment_method_id: string | null; payment_destination_snapshot: RentPaymentDestination | null; paid_at: string | null; confirmed_by: string | null; confirmed_at: string | null; created_at: string; updated_at: string; amount?: number | null; total_amount?: number | null; }
export interface MovingInvoice { id: string; booking_id: string; invoice_number: string; renter_id: string; mover_id: string; amount_kes: number; currency: 'KES' | string; status: string; payment_provider: string | null; provider_reference: string | null; provider_transaction_id: string | null; paid_at: string | null; released_at: string | null; mover_name_snapshot: string; mover_phone_snapshot: string | null; vehicle_type_snapshot: string | null; number_plate_snapshot: string | null; mover_profile_photo_snapshot: string | null; created_at: string; updated_at: string; platform_fee_kes?: number; mover_net_kes?: number; }
export interface RentPaymentSubmission { id: string; invoice_id: string; renter_user_id: string; landlord_id: string; renter_assoc_id: string; unit_id: string; transaction_reference: string; status: string; submitted_at: string; confirmed_by: string | null; confirmed_at: string | null; rejection_reason: string | null; created_at: string; updated_at: string; }
export interface Booking { id: string; renter_id: string; mover_id: string; listing_id: string | null; pickup_address: string; dropoff_address: string; moving_date: string; booking_amount: number; commission_amount: number; total_amount: number; status: string; payment_status: string; payment_method: string | null; distance_km: number | null; rate_per_km_kes: number | null; base_rate_kes: number | null; pickup_latitude: number | null; pickup_longitude: number | null; dropoff_latitude: number | null; dropoff_longitude: number | null; requested_at: string | null; request_expires_at: string | null; confirmed_at: string | null; tracking_number: string | null; last_known_latitude: number | null; last_known_longitude: number | null; last_location_at: string | null; scheduled_start_at: string | null; scheduled_end_at: string | null; started_at: string | null; renter_confirmed_delivery_at: string | null; mover_confirmed_delivery_at: string | null; contact_released_at: string | null; dispute_status: string | null; completed_at: string | null; cancelled_at: string | null; cancellation_reason: string | null; cancellation_details: string | null; created_at: string | null; updated_at: string | null; }
export interface RequestMoverBookingInput { moverId: string; pickupAddress: string; dropoffAddress: string; pickupLatitude: number; pickupLongitude: number; dropoffLatitude: number; dropoffLongitude: number; distanceKm: number; listingId?: string | null; movingDate?: string; paymentMethod?: string | null; }
export interface RequestMoverBookingResponse { booking_id: string; conversation_id: string; status: 'pending' | string; request_expires_at: string; quote: { base_rate_kes?: number; rate_per_km_kes?: number; distance_km?: number; platform_fee_kes?: number; renter_total_kes?: number; mover_net_kes?: number; [key: string]: unknown; }; }
export interface MoverQuoteResponse { moverId: string; distanceKm: number; baseRateKes: number; ratePerKmKes: number; moverChargeKes: number; operationalMarkupRate: number; operationalMarkupKes: number; commissionRate: number; commissionKes: number; renterTotalKes: number; netMoverPayableKes: number; currency: string; }
export interface RenterDashboardResponse { association: RenterAssociation | null; unit: RenterUnit | null; property: RenterProperty | null; invoices: RentInvoice[]; bookings: Booking[]; }
export interface RenterCalendarResponse { invoices: RentInvoice[]; bookings: Booking[]; }
export interface RenterNotificationsResponse { notifications: Array<{ id: string; renter_user_id: string; renter_assoc_id: string | null; landlord_id: string | null; notification_type: string; title: string; body: string; action_type: string | null; action_payload: Record<string, unknown>; read_at: string | null; created_at: string; }>; }
export interface RenterChatResponse { messages: unknown[]; }
export interface MoverScheduleAvailability { booking_id: string; mover_id: string; working_days: string[] | null; start_time: string | null; end_time: string | null; blocked_intervals: Array<{ starts_at: string; ends_at: string; status: string | null }>; }

const mapInvoice = (invoice: RentInvoice): RentInvoice => ({ ...invoice, amount: invoice.amount_kes, total_amount: invoice.amount_kes });
const mapBooking = (row: Record<string, unknown>): Booking => row as unknown as Booking;

export const renterApi = {
  getDashboard: async (_userId?: string) => djangoApi.get<RenterDashboardResponse>('/api/core/renter/dashboard/'),
  getInvoices: async (_userId?: string) => (await djangoApi.get<RentInvoice[]>('/api/core/renter/invoices/')).map(mapInvoice),
  getInvoice: async (id: string) => mapInvoice(await djangoApi.get<RentInvoice>(`/api/core/renter/invoices/${id}/`)),
  getMovingInvoice: async (bookingId: string) => {
    if (!bookingId) return null;
    const invoices = await djangoApi.get<MovingInvoice[]>('/api/core/moving-invoices/');
    return (invoices ?? []).find((invoice) => invoice.booking_id === bookingId) ?? null;
  },
  getPaymentSubmissions: (invoiceId: string) => djangoApi.get<RentPaymentSubmission[]>(`/api/core/renter/invoices/${invoiceId}/submissions/`),
  submitRentPayment: async (invoiceId: string, transactionReference: string, paymentMethod?: string, paymentDate?: string) => {
    const reference = transactionReference.trim();
    if (!reference) throw new Error('Transaction ID is required.');
    return djangoApi.post(`/api/core/invoices/${invoiceId}/submit-payment/`, { transaction_reference: reference, payment_method: paymentMethod, payment_date: paymentDate });
  },
  getPaymentDestination: (paymentMethodId: string, unitId: string) => djangoApi.post<RentPaymentDestination>('/api/core/renter/payment-destination/', { payment_method_id: paymentMethodId, unit_id: unitId }),
  getRentSummary: (associationId: string) => djangoApi.post<Record<string, unknown>>('/api/core/renter/rent-summary/', { renter_assoc_id: associationId }),
  getPaymentHistory: (associationId: string) => djangoApi.post('/api/core/renter/payment-history/', { assoc_id: associationId }),
  getBookings: async (_userId?: string) => (await djangoApi.get<Record<string, unknown>[]>('/api/core/bookings/')).map(mapBooking),
  getBooking: async (id: string) => mapBooking(await djangoApi.get<Record<string, unknown>>(`/api/core/bookings/${id}/`)),
  getMoverQuote: async (moverId: string, distanceKm: number): Promise<MoverQuoteResponse> => {
    if (!moverId) throw new Error('Mover is required.');
    if (!Number.isFinite(distanceKm) || distanceKm < 0) throw new Error('Invalid route distance.');
    const quote = await djangoApi.post<Record<string, unknown>>('/api/core/movers/quote/', { mover_id: moverId, distance_km: distanceKm });
    return { moverId: String(quote.mover_id ?? moverId), distanceKm: Number(quote.distance_km ?? distanceKm), baseRateKes: Number(quote.base_rate_kes ?? 0), ratePerKmKes: Number(quote.rate_per_km_kes ?? 0), moverChargeKes: Number(quote.mover_charge_kes ?? quote.renter_total_kes ?? 0), operationalMarkupRate: Number(quote.operational_markup_rate ?? 0), operationalMarkupKes: Number(quote.operational_markup_kes ?? 0), commissionRate: Number(quote.platform_commission_rate ?? quote.commission_rate ?? 0), commissionKes: Number(quote.platform_fee_kes ?? quote.commission_kes ?? 0), renterTotalKes: Number(quote.renter_total_kes ?? 0), netMoverPayableKes: Number(quote.mover_net_kes ?? quote.net_mover_payable_kes ?? 0), currency: String(quote.currency ?? 'KES') };
  },
  requestMoverBooking: async (input: RequestMoverBookingInput) => {
    const result = await djangoApi.post<RequestMoverBookingResponse>('/api/core/bookings/request/', { mover_id: input.moverId, pickup_address: input.pickupAddress.trim(), dropoff_address: input.dropoffAddress.trim(), pickup_latitude: input.pickupLatitude, pickup_longitude: input.pickupLongitude, dropoff_latitude: input.dropoffLatitude, dropoff_longitude: input.dropoffLongitude, distance_km: input.distanceKm, listing_id: input.listingId ?? null, moving_date: input.movingDate, preferred_payment_method: input.paymentMethod ?? null });
    if (!result?.booking_id) throw new Error('The mover request was not created.');
    return result;
  },
  getCalendar: async (userId?: string) => ({ invoices: await renterApi.getInvoices(userId), bookings: await renterApi.getBookings(userId) }),
  getMoverScheduleAvailability: (bookingId: string, from: string, to: string) => djangoApi.post<MoverScheduleAvailability>('/api/core/renter/mover-schedule-availability/', { booking_id: bookingId, from, to }),
  getNotifications: (_userId?: string) => djangoApi.get<RenterNotificationsResponse>('/api/core/renter-notifications/'),
  getChat: async (): Promise<RenterChatResponse> => ({ messages: [] }),
};
