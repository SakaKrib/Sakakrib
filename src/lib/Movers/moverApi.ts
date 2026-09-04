import { protectedGet, protectedPatch, protectedPost } from '@/lib/djangoApi';

export interface MoverRecord {
  id: string; user_id: string; driver_full_name: string | null; vehicle_type: string | null; number_plate: string | null;
  operating_city: string | null; operating_county: string | null; phone: string | null; profile_photo_url: string | null;
  base_rate_kes: number | null; is_available: boolean; created_at: string | null; updated_at: string | null;
  business_name: string | null; working_days: string[] | null; start_time: string | null; end_time: string | null;
  payment_channel: string | null; liability_accepted: boolean; reference_contacts: unknown; approval_status: string | null;
  rate_per_km_kes: number | null; insurance_policy_details: unknown; vehicle_inspection_expiry: string | null;
  terms_accepted: boolean; current_latitude: number | null; current_longitude: number | null; location_updated_at: string | null;
  location: unknown; capacity_details: unknown;
}

export interface MoverBooking {
  id: string; renter_id: string; mover_id: string; listing_id: string | null; pickup_address: string; dropoff_address: string;
  moving_date: string | null; booking_amount: number | null; commission_amount: number | null; total_amount: number | null;
  status: string | null; payment_status: string | null; payment_method: string | null; created_at: string | null; updated_at: string | null;
  distance_km: number | null; rate_per_km_kes: number | null; base_rate_kes: number | null;
  pickup_latitude: number | null; pickup_longitude: number | null; dropoff_latitude: number | null; dropoff_longitude: number | null;
  requested_at: string | null; request_expires_at: string | null; confirmed_at: string | null; scheduled_start_at: string | null;
  scheduled_end_at: string | null; started_at: string | null; completed_at: string | null; cancelled_at: string | null;
  cancellation_reason: string | null; cancellation_details: string | null; tracking_number: string | null;
  renter_confirmed_delivery_at: string | null; contact_released_at: string | null; last_known_latitude: number | null;
  last_known_longitude: number | null; last_location_at: string | null; mover_confirmed_delivery_at: string | null; dispute_status: string | null;
}

export interface MoverCustomerBooking {
  id: string; status: string | null; payment_status: string | null; moving_date: string | null;
  pickup_address: string; dropoff_address: string; total_amount: number | null; updated_at: string | null;
}

export interface MoverCustomer {
  id: string; full_name: string | null; phone: string | null; profile_photo_url: string | null;
  city: string | null; county: string | null; email: string | null; booking_count: number;
  last_booking_id: string | null; contact_released: boolean; bookings: MoverCustomerBooking[];
}

export interface MoverScheduleEvent { id: string; mover_id: string; booking_id: string; starts_at: string; ends_at: string; status: string; title: string; created_at: string | null; updated_at: string | null; }
export interface MoverBookingDetail {
  booking: MoverBooking;
  renter: { id: string; full_name: string | null; phone: string | null; profile_photo_url: string | null; city: string | null; county: string | null } | null;
  mover: Partial<MoverRecord> & { id: string }; schedule: MoverScheduleEvent | null; response_deadline: string | null; can_respond: boolean; contact_released?: boolean;
}
export interface MoverTrackingPoint { id: number; booking_id: string; mover_id: string; latitude: number; longitude: number; accuracy_meters: number | null; speed_kph: number | null; heading_degrees: number | null; recorded_at: string; }
export interface MoverTrackingResponse {
  booking: { id: string; status: string | null; tracking_number: string | null; started_at: string | null; completed_at: string | null; last_known_latitude: number | null; last_known_longitude: number | null; last_location_at: string | null };
  mover: (Partial<MoverRecord> & { id: string }) | null; tracking_points: MoverTrackingPoint[];
}
export interface MoverLocationTelemetry { latitude: number; longitude: number; accuracy_meters?: number | null; speed_kph?: number | null; heading_degrees?: number | null; }
export type MoverLatestLocation = MoverTrackingPoint;
export interface MoverInvoice { id: string; booking_id: string; invoice_number: string; renter_id: string; mover_id: string; amount_kes: number; platform_fee_kes: number; mover_net_kes: number; currency: string; status: string; payment_provider: string | null; provider_reference: string | null; provider_transaction_id: string | null; paid_at: string | null; released_at: string | null; mover_name_snapshot: string; mover_phone_snapshot: string | null; vehicle_type_snapshot: string | null; number_plate_snapshot: string | null; mover_profile_photo_snapshot: string | null; created_at: string; updated_at: string; }
export interface MoverPayment { id: string; booking_id: string; invoice_id: string; payer_id: string; amount_kes: number; provider: string; status: string; provider_reference: string | null; provider_transaction_id: string | null; mpesa_receipt: string | null; paypal_order_id: string | null; provider_amount: number | null; provider_currency: string | null; created_at: string; paid_at: string | null; released_at: string | null; updated_at: string; }
export interface MoverPayout { id: string; booking_id: string; mover_id: string; mover_name: string; national_id: string | null; payment_channel: string | null; renter_payment: number; platform_deduction: number; net_mover_payable: number; down_payment_amount: number | null; final_payment_amount: number | null; down_payment_status: string | null; final_payment_status: string | null; job_started_at: string | null; delivery_confirmed_at: string | null; down_payment_released_at: string | null; final_payment_released_at: string | null; created_at: string; updated_at: string; payout_provider: string | null; payout_provider_reference: string | null; payout_provider_transaction_id: string | null; payout_failure_reason: string | null; payout_requested_at: string | null; payout_completed_at: string | null; }
export interface MoverDispute { id: string; booking_id: string; opened_by: string; reason_code: string; description: string; status: string; resolution_code: string | null; resolution_notes: string | null; resolved_by: string | null; opened_at: string; resolved_at: string | null; created_at: string; updated_at: string; }
export interface MoverNotification { id: string; notification_type: string; title: string; message: string; data: Record<string, unknown>; read_at: string | null; created_at: string; }
export interface MoverNotificationsResponse { notifications: MoverNotification[] }
export interface MoverChatMessage { [key: string]: unknown }
export interface MoverChatResponse { messages: MoverChatMessage[] }

const core = '/api/core';

export const moverApi = {
  getMover: async (userId: string): Promise<MoverRecord | null> => { if (!userId) throw new Error('Authenticated mover identity is required.'); const rows = await protectedGet<MoverRecord[]>(`${core}/movers/`); return (rows ?? []).find((row) => row.user_id === userId) ?? null; },
  getBookings: (): Promise<MoverBooking[]> => protectedGet<MoverBooking[]>(`${core}/bookings/`),
  getCustomers: (): Promise<MoverCustomer[]> => protectedGet<MoverCustomer[]>(`${core}/moving-customers/`),
  getCustomer: (customerId: string): Promise<MoverCustomer> => protectedGet<MoverCustomer>(`${core}/moving-customers/${encodeURIComponent(customerId)}/`),
  getBooking: (bookingId: string): Promise<MoverBooking> => protectedGet<MoverBooking>(`${core}/bookings/${encodeURIComponent(bookingId)}/`),
  getBookingDetail: (bookingId: string): Promise<MoverBookingDetail> => protectedGet<MoverBookingDetail>(`${core}/bookings/${encodeURIComponent(bookingId)}/detail/`),
  respondToBooking: (bookingId: string, decision: 'confirm' | 'not_sure' | 'cancel', reason?: string | null) => protectedPost<{ booking_id: string; decision: string; status: string }>(`${core}/bookings/${encodeURIComponent(bookingId)}/respond/`, { decision, reason: reason?.trim() || null }),
  cancelBooking: (bookingId: string, reasonCode: string, reasonText: string) => protectedPost<Record<string, unknown>>(`${core}/bookings/${encodeURIComponent(bookingId)}/cancel/`, { reason_code: reasonCode, reason_text: reasonText.trim() }),
  getSchedule: (): Promise<MoverScheduleEvent[]> => protectedGet<MoverScheduleEvent[]>(`${core}/mover-schedule-events/`),
  confirmSchedule: (bookingId: string) => protectedPost<Record<string, unknown>>(`${core}/bookings/${encodeURIComponent(bookingId)}/schedule/confirm/`, {}),
  startJourney: (bookingId: string) => protectedPost<{ booking_id: string; tracking_number: string; started_at: string; status: string }>(`${core}/bookings/${encodeURIComponent(bookingId)}/start/`, {}),
  getTracking: (bookingId: string): Promise<MoverTrackingResponse> => protectedGet<MoverTrackingResponse>(`${core}/bookings/${encodeURIComponent(bookingId)}/tracking/`),
  recordLocation: (bookingId: string, telemetry: MoverLocationTelemetry) => protectedPost<{ accepted: boolean; throttled: boolean; booking_id: string; latitude?: number; longitude?: number; recorded_at: string }>(`${core}/bookings/${encodeURIComponent(bookingId)}/tracking/`, telemetry),
  getLatestLocation: (bookingId: string): Promise<MoverLatestLocation | null> => protectedGet<MoverLatestLocation | null>(`${core}/bookings/${encodeURIComponent(bookingId)}/tracking/latest/`),
  confirmDelivery: (bookingId: string) => protectedPost<{ booking_id: string; renter_confirmed: boolean; mover_confirmed: boolean; both_confirmed: boolean; status: string; already_confirmed: boolean }>(`${core}/bookings/${encodeURIComponent(bookingId)}/delivery/confirm/`, {}),
  openDispute: (bookingId: string, reasonCode: string, description: string) => protectedPost<{ dispute_id: string; booking_id: string; status: string }>(`${core}/bookings/${encodeURIComponent(bookingId)}/disputes/`, { reason_code: reasonCode, description: description.trim() }),
  getInvoices: (): Promise<MoverInvoice[]> => protectedGet<MoverInvoice[]>(`${core}/moving-invoices/`),
  getPayments: (): Promise<MoverPayment[]> => protectedGet<MoverPayment[]>(`${core}/moving-payments/`),
  getPayouts: (): Promise<MoverPayout[]> => protectedGet<MoverPayout[]>(`${core}/mover-payouts/`),
  getDisputes: (): Promise<MoverDispute[]> => protectedGet<MoverDispute[]>(`${core}/moving-disputes/`),
  getTrackingPoints: (): Promise<MoverTrackingPoint[]> => protectedGet<MoverTrackingPoint[]>(`${core}/moving-tracking-points/`),
  getCancellationEvents: (): Promise<Array<Record<string, unknown>>> => protectedGet<Array<Record<string, unknown>>>(`${core}/moving-cancellation-events/`),
  getNotifications: (limit = 50): Promise<MoverNotificationsResponse> => protectedGet<MoverNotificationsResponse>(`${core}/notifications/?limit=${Math.max(1, Math.min(limit, 100))}`),
  markNotificationRead: (notificationId: string) => protectedPatch<{ notification: MoverNotification }>(`${core}/notifications/`, { id: notificationId }),
  getConversation: (conversationId: string, limit = 50, before?: string): Promise<MoverChatResponse> => { const params = new URLSearchParams({ conversation_id: conversationId, limit: String(limit) }); if (before) params.set('before', before); return protectedGet<MoverChatResponse>(`${core}/chat/?${params.toString()}`); },
  sendMessage: (receiverId: string, content: string, messageType = 'text', eventData?: Record<string, unknown>) => protectedPost<{ message: MoverChatMessage }>(`${core}/chat/`, { receiver_id: receiverId, content, message_type: messageType, event_data: eventData }),
};

export type MoverApi = typeof moverApi;
