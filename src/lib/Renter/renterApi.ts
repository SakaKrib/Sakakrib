import { protectedGet, protectedPost } from '@/lib/protectedApi';

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
export interface RenterDashboardResponse { association: RenterAssociation | null; unit: RenterUnit | null; property: RenterProperty | null; invoices: RentInvoice[]; bookings: Booking[]; }
export interface RenterCalendarResponse { invoices: RentInvoice[]; bookings: Booking[]; }
export interface RenterNotificationsResponse { notifications: Array<{ id: string; renter_user_id: string; renter_assoc_id: string | null; landlord_id: string | null; notification_type: string; title: string; body: string; action_type: string | null; action_payload: Record<string, unknown>; read_at: string | null; created_at: string; }>; }
export interface RenterChatResponse { messages: unknown[]; }
export interface MoverScheduleAvailability { booking_id: string; mover_id: string; working_days: string[] | null; start_time: string | null; end_time: string | null; blocked_intervals: Array<{ starts_at: string; ends_at: string; status: string | null }>; }

const encode = (value: string) => encodeURIComponent(value);
const invoiceSelect = 'id,invoice_number,landlord_id,renter_user_id,renter_assoc_id,listing_id,unit_id,billing_period_start,billing_period_end,due_date,amount_kes,currency,status,payment_method_id,payment_destination_snapshot,paid_at,confirmed_by,confirmed_at,created_at,updated_at';
const movingInvoiceSelect = 'id,booking_id,invoice_number,renter_id,mover_id,amount_kes,currency,status,payment_provider,provider_reference,provider_transaction_id,paid_at,released_at,mover_name_snapshot,mover_phone_snapshot,vehicle_type_snapshot,number_plate_snapshot,mover_profile_photo_snapshot,created_at,updated_at';
const bookingSelect = 'id,renter_id,mover_id,listing_id,pickup_address,dropoff_address,moving_date,booking_amount,commission_amount,total_amount,status,payment_status,payment_method,distance_km,rate_per_km_kes,base_rate_kes,pickup_latitude,pickup_longitude,dropoff_latitude,dropoff_longitude,requested_at,request_expires_at,confirmed_at,tracking_number,last_known_latitude,last_known_longitude,last_location_at,scheduled_start_at,scheduled_end_at,started_at,renter_confirmed_delivery_at,mover_confirmed_delivery_at,contact_released_at,dispute_status,completed_at,cancelled_at,cancellation_reason,cancellation_details,created_at,updated_at';
const mapInvoice = (invoice: RentInvoice): RentInvoice => ({ ...invoice, amount: invoice.amount_kes, total_amount: invoice.amount_kes });

export const renterApi = {
  getDashboard: async (userId?: string): Promise<RenterDashboardResponse> => {
    if (!userId) throw new Error('Authenticated renter identity is required.');
    const associations = await protectedGet<RenterAssociation[]>(`/rest/v1/renter_unit_associations?renter_user_id=eq.${encode(userId)}&status=eq.ACTIVE&select=id,renter_user_id,unit_id,landlord_id,status,rent_amount,lease_start,lease_end&order=created_at.desc&limit=1`);
    const association = associations?.[0] ?? null;
    const [invoices, bookings] = await Promise.all([renterApi.getInvoices(userId), renterApi.getBookings(userId)]);
    if (!association) return { association: null, unit: null, property: null, invoices, bookings };
    const units = await protectedGet<RenterUnit[]>(`/rest/v1/property_units?id=eq.${encode(association.unit_id)}&select=id,listing_id,unit_number,unit_type,rent,deposit_amount,size,beds,baths,availability,description,rent_due_day,rent_paid_in_advance,rent_paid_through_month&limit=1`);
    const unit = units?.[0] ?? null;
    let property: RenterProperty | null = null;
    if (unit?.listing_id) {
      const properties = await protectedGet<RenterProperty[]>(`/rest/v1/listings?id=eq.${encode(unit.listing_id)}&select=id,title,city,county,address,cover_image_url&limit=1`);
      property = properties?.[0] ?? null;
    }
    return { association, unit, property, invoices, bookings };
  },
  getInvoices: async (userId?: string): Promise<RentInvoice[]> => {
    if (!userId) throw new Error('Authenticated renter identity is required.');
    const invoices = await protectedGet<RentInvoice[]>(`/rest/v1/rent_invoices?renter_user_id=eq.${encode(userId)}&select=${invoiceSelect}&order=due_date.desc`);
    return (invoices ?? []).map(mapInvoice);
  },
  getInvoice: async (id: string): Promise<RentInvoice> => {
    const invoices = await protectedGet<RentInvoice[]>(`/rest/v1/rent_invoices?id=eq.${encode(id)}&select=${invoiceSelect}&limit=1`);
    const invoice = invoices?.[0];
    if (!invoice) throw new Error('Invoice not found.');
    return mapInvoice(invoice);
  },
  getMovingInvoice: async (bookingId: string): Promise<MovingInvoice | null> => {
    if (!bookingId) return null;
    const invoices = await protectedGet<MovingInvoice[]>(`/rest/v1/moving_invoices?booking_id=eq.${encode(bookingId)}&select=${movingInvoiceSelect}&limit=1`);
    return invoices?.[0] ?? null;
  },
  getPaymentSubmissions: async (invoiceId: string): Promise<RentPaymentSubmission[]> => {
    const rows = await protectedGet<RentPaymentSubmission[]>(`/rest/v1/rent_payment_submissions?invoice_id=eq.${encode(invoiceId)}&select=id,invoice_id,renter_user_id,landlord_id,renter_assoc_id,unit_id,transaction_reference,status,submitted_at,confirmed_by,confirmed_at,rejection_reason,created_at,updated_at&order=submitted_at.desc`);
    return rows ?? [];
  },
  submitRentPayment: async (invoiceId: string, transactionReference: string) => {
    const reference = transactionReference.trim();
    if (!reference) throw new Error('Transaction ID is required.');
    return protectedPost<{ success: boolean; submission_id?: string; invoice_id?: string; status?: string }>('/rest/v1/rpc/submit_rent_payment', { p_invoice_id: invoiceId, p_transaction_reference: reference });
  },
  getPaymentDestination: (paymentMethodId: string, unitId: string) => protectedPost<RentPaymentDestination | null>('/rest/v1/rpc/get_rent_payment_destination', { p_payment_method_id: paymentMethodId, p_unit_id: unitId }),
  getRentSummary: (associationId: string) => protectedPost<Record<string, unknown>>('/rest/v1/rpc/get_renter_rent_summary', { p_renter_assoc_id: associationId }),
  getPaymentHistory: (associationId: string) => protectedPost<Array<{ id: string; amount_kes: number; period_year: number; period_month: number; status: string; payment_provider: string | null; payment_method: string | null; mpesa_receipt: string | null; paid_at: string | null; created_at: string }>>('/rest/v1/rpc/get_renter_payment_history', { p_assoc_id: associationId }),
  getBookings: async (userId?: string): Promise<Booking[]> => {
    if (!userId) throw new Error('Authenticated renter identity is required.');
    return protectedGet<Booking[]>(`/rest/v1/bookings?renter_id=eq.${encode(userId)}&select=${bookingSelect}&order=moving_date.asc`);
  },
  getBooking: async (id: string): Promise<Booking> => {
    const bookings = await protectedGet<Booking[]>(`/rest/v1/bookings?id=eq.${encode(id)}&select=${bookingSelect}&limit=1`);
    const booking = bookings?.[0];
    if (!booking) throw new Error('Booking not found.');
    return booking;
  },
  requestMoverBooking: async (input: RequestMoverBookingInput): Promise<RequestMoverBookingResponse> => {
    const pickupAddress = input.pickupAddress.trim();
    const dropoffAddress = input.dropoffAddress.trim();
    if (!input.moverId) throw new Error('Mover is required.');
    if (!pickupAddress) throw new Error('Pickup address is required.');
    if (!dropoffAddress) throw new Error('Drop-off address is required.');
    if (!Number.isFinite(input.pickupLatitude) || !Number.isFinite(input.pickupLongitude) || !Number.isFinite(input.dropoffLatitude) || !Number.isFinite(input.dropoffLongitude)) throw new Error('Please select valid pickup and drop-off locations.');
    if (!Number.isFinite(input.distanceKm) || input.distanceKm < 0) throw new Error('Invalid route distance.');
    const result = await protectedPost<RequestMoverBookingResponse>('/rest/v1/rpc/request_mover_booking', {
      p_mover_id: input.moverId, p_pickup_address: pickupAddress, p_dropoff_address: dropoffAddress,
      p_pickup_latitude: input.pickupLatitude, p_pickup_longitude: input.pickupLongitude,
      p_dropoff_latitude: input.dropoffLatitude, p_dropoff_longitude: input.dropoffLongitude,
      p_distance_km: input.distanceKm, p_listing_id: input.listingId ?? null,
    });
    if (!result?.booking_id) throw new Error('The mover request was not created.');
    return result;
  },
  getCalendar: async (userId?: string): Promise<RenterCalendarResponse> => {
    const [invoices, bookings] = await Promise.all([renterApi.getInvoices(userId), renterApi.getBookings(userId)]);
    return { invoices, bookings };
  },
  getMoverScheduleAvailability: (bookingId: string, from: string, to: string) => protectedPost<MoverScheduleAvailability>('/rest/v1/rpc/get_mover_schedule_availability', { p_booking_id: bookingId, p_from: from, p_to: to }),
  getNotifications: async (userId?: string): Promise<RenterNotificationsResponse> => {
    if (!userId) throw new Error('Authenticated renter identity is required.');
    const notifications = await protectedGet<RenterNotificationsResponse['notifications']>(`/rest/v1/renter_notifications?renter_user_id=eq.${encode(userId)}&select=id,renter_user_id,renter_assoc_id,landlord_id,notification_type,title,body,action_type,action_payload,read_at,created_at&order=created_at.desc`);
    return { notifications: notifications ?? [] };
  },
  getChat: async (): Promise<RenterChatResponse> => ({ messages: [] }),
};