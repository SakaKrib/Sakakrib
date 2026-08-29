import { protectedGet, protectedPost } from '@/lib/protectedApi';

export interface RenterAssociation {
  id: string;
  renter_user_id: string | null;
  unit_id: string;
  landlord_id: string;
  status: string;
  rent_amount: number | null;
  lease_start: string | null;
  lease_end: string | null;
}

export interface RenterUnit {
  id: string;
  listing_id: string;
  unit_number: string;
  unit_type: string;
  rent: number;
  deposit_amount: number;
  size: string | null;
  beds: number;
  baths: number;
  availability: string;
  description: string | null;
  rent_due_day: number;
  rent_paid_in_advance: boolean;
  rent_paid_through_month: string | null;
}

export interface RenterProperty {
  id: string;
  title: string;
  city: string;
  county: string;
  address: string | null;
  cover_image_url: string | null;
}

export interface RentInvoice {
  id: string;
  invoice_number: string;
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
  paid_at: string | null;
  created_at: string;
  updated_at: string;

  // UI-compatible aliases.
  amount?: number | null;
  total_amount?: number | null;
}

export interface Booking {
  id: string;
  renter_id: string;
  mover_id: string;
  listing_id: string | null;
  pickup_address: string;
  dropoff_address: string;
  moving_date: string;
  booking_amount: number;
  commission_amount: number;
  total_amount: number;
  status: string;
  payment_status: string;
  payment_method: string | null;
  tracking_number: string | null;
  last_known_latitude: number | null;
  last_known_longitude: number | null;
  last_location_at: string | null;
  scheduled_start_at: string | null;
  scheduled_end_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface RenterDashboardResponse {
  association: RenterAssociation | null;
  unit: RenterUnit | null;
  property: RenterProperty | null;
  invoices: RentInvoice[];
  bookings: Booking[];
}

export interface RenterCalendarResponse {
  invoices: RentInvoice[];
  bookings: Booking[];
}

export interface RenterNotificationsResponse {
  notifications: Array<{
    id: string;
    renter_user_id: string;
    renter_assoc_id: string | null;
    landlord_id: string | null;
    notification_type: string;
    title: string;
    body: string;
    action_type: string | null;
    action_payload: Record<string, unknown>;
    read_at: string | null;
    created_at: string;
  }>;
}

export interface RenterChatResponse {
  messages: unknown[];
}

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

const encode = (value: string) => encodeURIComponent(value);

const mapInvoice = (invoice: Omit<RentInvoice, 'amount' | 'total_amount'>): RentInvoice => ({
  ...invoice,
  amount: invoice.amount_kes,
  total_amount: invoice.amount_kes,
});

export const renterApi = {
  /**
   * Dashboard data is assembled from the real renter tables.
   * Every request goes through protected-api, so the browser never
   * supplies an access token and PostgREST receives the authenticated
   * JWT injected by the Edge Function.
   */
  getDashboard: async (userId?: string): Promise<RenterDashboardResponse> => {
    if (!userId) {
      throw new Error('Authenticated renter identity is required.');
    }

    const associations = await protectedGet<RenterAssociation[]>(
      `/rest/v1/renter_unit_associations?renter_user_id=eq.${encode(userId)}&status=eq.ACTIVE&select=id,renter_user_id,unit_id,landlord_id,status,rent_amount,lease_start,lease_end&order=created_at.desc&limit=1`,
    );

    const association = associations?.[0] ?? null;

    if (!association) {
      const [invoices, bookings] = await Promise.all([
        protectedGet<RentInvoice[]>(
          `/rest/v1/rent_invoices?renter_user_id=eq.${encode(userId)}&select=id,invoice_number,renter_user_id,renter_assoc_id,listing_id,unit_id,billing_period_start,billing_period_end,due_date,amount_kes,currency,status,paid_at,created_at,updated_at&order=due_date.asc&limit=12`,
        ),
        protectedGet<Booking[]>(
          `/rest/v1/bookings?renter_id=eq.${encode(userId)}&select=id,renter_id,mover_id,listing_id,pickup_address,dropoff_address,moving_date,booking_amount,commission_amount,total_amount,status,payment_status,payment_method,tracking_number,last_known_latitude,last_known_longitude,last_location_at,scheduled_start_at,scheduled_end_at,started_at,completed_at,cancelled_at,created_at,updated_at&order=moving_date.asc&limit=12`,
        ),
      ]);

      return {
        association: null,
        unit: null,
        property: null,
        invoices: (invoices ?? []).map(mapInvoice),
        bookings: bookings ?? [],
      };
    }

    const [units, invoices, bookings] = await Promise.all([
      protectedGet<RenterUnit[]>(
        `/rest/v1/property_units?id=eq.${encode(association.unit_id)}&select=id,listing_id,unit_number,unit_type,rent,deposit_amount,size,beds,baths,availability,description,rent_due_day,rent_paid_in_advance,rent_paid_through_month&limit=1`,
      ),
      protectedGet<RentInvoice[]>(
        `/rest/v1/rent_invoices?renter_user_id=eq.${encode(userId)}&select=id,invoice_number,renter_user_id,renter_assoc_id,listing_id,unit_id,billing_period_start,billing_period_end,due_date,amount_kes,currency,status,paid_at,created_at,updated_at&order=due_date.asc&limit=12`,
      ),
      protectedGet<Booking[]>(
        `/rest/v1/bookings?renter_id=eq.${encode(userId)}&select=id,renter_id,mover_id,listing_id,pickup_address,dropoff_address,moving_date,booking_amount,commission_amount,total_amount,status,payment_status,payment_method,tracking_number,last_known_latitude,last_known_longitude,last_location_at,scheduled_start_at,scheduled_end_at,started_at,completed_at,cancelled_at,created_at,updated_at&order=moving_date.asc&limit=12`,
      ),
    ]);

    const unit = units?.[0] ?? null;

    let property: RenterProperty | null = null;

    if (unit?.listing_id) {
      const properties = await protectedGet<RenterProperty[]>(
        `/rest/v1/listings?id=eq.${encode(unit.listing_id)}&select=id,title,city,county,address,cover_image_url&limit=1`,
      );

      property = properties?.[0] ?? null;
    }

    return {
      association,
      unit,
      property,
      invoices: (invoices ?? []).map(mapInvoice),
      bookings: bookings ?? [],
    };
  },

  getInvoices: async (userId?: string) => {
    if (!userId) throw new Error('Authenticated renter identity is required.');

    const invoices = await protectedGet<RentInvoice[]>(
      `/rest/v1/rent_invoices?renter_user_id=eq.${encode(userId)}&select=id,invoice_number,renter_user_id,renter_assoc_id,listing_id,unit_id,billing_period_start,billing_period_end,due_date,amount_kes,currency,status,paid_at,created_at,updated_at&order=due_date.asc`,
    );

    return (invoices ?? []).map(mapInvoice);
  },

  getInvoice: async (id: string) => {
    const invoices = await protectedGet<RentInvoice[]>(
      `/rest/v1/rent_invoices?id=eq.${encode(id)}&select=id,invoice_number,renter_user_id,renter_assoc_id,listing_id,unit_id,billing_period_start,billing_period_end,due_date,amount_kes,currency,status,paid_at,created_at,updated_at&limit=1`,
    );

    const invoice = invoices?.[0];
    if (!invoice) throw new Error('Invoice not found.');
    return mapInvoice(invoice);
  },

  getBookings: async (userId?: string) => {
    if (!userId) throw new Error('Authenticated renter identity is required.');

    return protectedGet<Booking[]>(
      `/rest/v1/bookings?renter_id=eq.${encode(userId)}&select=id,renter_id,mover_id,listing_id,pickup_address,dropoff_address,moving_date,booking_amount,commission_amount,total_amount,status,payment_status,payment_method,tracking_number,last_known_latitude,last_known_longitude,last_location_at,scheduled_start_at,scheduled_end_at,started_at,completed_at,cancelled_at,created_at,updated_at&order=moving_date.asc`,
    );
  },

  getBooking: async (id: string) => {
    const bookings = await protectedGet<Booking[]>(
      `/rest/v1/bookings?id=eq.${encode(id)}&select=id,renter_id,mover_id,listing_id,pickup_address,dropoff_address,moving_date,booking_amount,commission_amount,total_amount,status,payment_status,payment_method,tracking_number,last_known_latitude,last_known_longitude,last_location_at,scheduled_start_at,scheduled_end_at,started_at,completed_at,cancelled_at,created_at,updated_at&limit=1`,
    );

    const booking = bookings?.[0];
    if (!booking) throw new Error('Booking not found.');
    return booking;
  },

  getCalendar: async (userId?: string): Promise<RenterCalendarResponse> => {
    const [invoices, bookings] = await Promise.all([
      renterApi.getInvoices(userId),
      renterApi.getBookings(userId),
    ]);

    return { invoices, bookings };
  },

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

  getNotifications: async (userId?: string): Promise<RenterNotificationsResponse> => {
    if (!userId) throw new Error('Authenticated renter identity is required.');

    const notifications = await protectedGet<RenterNotificationsResponse['notifications']>(
      `/rest/v1/renter_notifications?renter_user_id=eq.${encode(userId)}&select=id,renter_user_id,renter_assoc_id,landlord_id,notification_type,title,body,action_type,action_payload,read_at,created_at&order=created_at.desc`,
    );

    return { notifications: notifications ?? [] };
  },

  getChat: async (): Promise<RenterChatResponse> => ({ messages: [] }),
};