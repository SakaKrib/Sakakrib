import { useEffect, useMemo, useState } from 'react';
import {
  Home,
  Receipt,
  CreditCard,
  Truck,
  MapPin,
  CalendarDays,
  ArrowRight,
  Clock3,
  CheckCircle2,
  AlertCircle,
  Building2,
  Plus,
  RefreshCw,
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import { supabase } from '@/lib/supabase';
import { formatKES, cn } from '@/lib/utils';

/* ============================================================
 * TYPES
 * ============================================================ */

interface RenterAssociation {
  id: string;
  renter_user_id: string;
  unit_id: string;
  landlord_id: string | null;
  status: string | null;
  lease_start_date: string | null;
  lease_end_date: string | null;
  rent_amount: number | null;
  created_at: string | null;
}

interface PropertyUnit {
  id: string;
  unit_number: string | null;
  name: string | null;
  property_id: string | null;
  monthly_rent: number | null;
}

interface PropertyListing {
  id: string;
  title: string | null;
  city: string | null;
  county: string | null;
  address: string | null;
  cover_image_url: string | null;
}

interface RentInvoice {
  id: string;
  renter_user_id: string | null;
  invoice_number: string | null;
  amount: number | null;
  total_amount: number | null;
  status: string | null;
  due_date: string | null;
  billing_period_start: string | null;
  billing_period_end: string | null;
  created_at: string | null;
}

interface Booking {
  id: string;
  renter_id: string | null;
  mover_id: string | null;
  pickup_address: string | null;
  dropoff_address: string | null;
  moving_date: string | null;
  booking_amount: number | null;
  total_amount: number | null;
  status: string | null;
  payment_status: string | null;
  created_at: string | null;
}

interface DashboardData {
  association: RenterAssociation | null;
  unit: PropertyUnit | null;
  property: PropertyListing | null;
  invoices: RentInvoice[];
  bookings: Booking[];
}

/* ============================================================
 * HELPERS
 * ============================================================ */

function isActiveAssociation(status: string | null | undefined) {
  if (!status) return false;

  return [
    'active',
    'ACTIVE',
    'approved',
    'APPROVED',
    'current',
    'CURRENT',
  ].includes(status);
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '—';

  return date.toLocaleDateString('en-KE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function getInvoiceStatus(status: string | null | undefined) {
  const normalized = status?.toLowerCase();

  if (
    normalized === 'paid' ||
    normalized === 'completed' ||
    normalized === 'settled'
  ) {
    return {
      label: 'Paid',
      className:
        'bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-400',
      icon: CheckCircle2,
    };
  }

  if (
    normalized === 'overdue' ||
    normalized === 'late'
  ) {
    return {
      label: 'Overdue',
      className:
        'bg-error-50 text-error-700 dark:bg-error-900/20 dark:text-error-400',
      icon: AlertCircle,
    };
  }

  return {
    label: status || 'Pending',
    className:
      'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400',
    icon: Clock3,
  };
}

function getBookingStatus(status: string | null | undefined) {
  const normalized = status?.toLowerCase();

  if (
    normalized === 'completed' ||
    normalized === 'complete'
  ) {
    return 'Completed';
  }

  if (
    normalized === 'cancelled' ||
    normalized === 'canceled'
  ) {
    return 'Cancelled';
  }

  if (
    normalized === 'in_progress' ||
    normalized === 'in-progress' ||
    normalized === 'ongoing'
  ) {
    return 'In Progress';
  }

  return status || 'Pending';
}

/* ============================================================
 * COMPONENT
 * ============================================================ */

export default function RenterDashboard() {
  const { profile, loading: authLoading } = useAuth();
  const { navigate } = useNav();

  const [data, setData] = useState<DashboardData>({
    association: null,
    unit: null,
    property: null,
    invoices: [],
    bookings: [],
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* ==========================================================
   * RENTER ACCESS GUARD
   * ========================================================== */

  useEffect(() => {
    if (authLoading) return;

    if (!profile) {
      navigate('home');
      return;
    }

    if (profile.role !== 'renter') {
      navigate('home');
    }
  }, [profile, authLoading, navigate]);

  /* ==========================================================
   * FETCH RENTER DATA
   * ========================================================== */

  const fetchDashboard = async () => {
    if (!profile || profile.role !== 'renter') {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      /*
       * --------------------------------------------------------
       * CURRENT RENTER PROPERTY
       * --------------------------------------------------------
       */

      const {
        data: associations,
        error: associationError,
      } = await supabase
        .from('renter_unit_associations')
        .select('*')
        .eq('renter_user_id', profile.id)
        .order('created_at', {
          ascending: false,
        });

      if (associationError) {
        throw associationError;
      }

      const activeAssociation =
        (associations as RenterAssociation[] | null)?.find(
          (association) =>
            isActiveAssociation(
              association.status
            )
        ) ??
        (associations?.[0] as
          | RenterAssociation
          | undefined) ??
        null;

      let unit: PropertyUnit | null = null;
      let property: PropertyListing | null = null;

      /*
       * --------------------------------------------------------
       * UNIT
       * --------------------------------------------------------
       */

      if (activeAssociation?.unit_id) {
        const {
          data: unitData,
          error: unitError,
        } = await supabase
          .from('property_units')
          .select('*')
          .eq(
            'id',
            activeAssociation.unit_id
          )
          .maybeSingle();

        if (unitError) {
          console.warn(
            'Failed to load renter unit:',
            unitError
          );
        }

        unit =
          (unitData as PropertyUnit | null) ??
          null;

        /*
         * ------------------------------------------------------
         * PROPERTY / LISTING
         * ------------------------------------------------------
         */

        if (unit?.property_id) {
          const {
            data: propertyData,
            error: propertyError,
          } = await supabase
            .from('listings')
            .select('*')
            .eq(
              'id',
              unit.property_id
            )
            .maybeSingle();

          if (propertyError) {
            console.warn(
              'Failed to load renter property:',
              propertyError
            );
          }

          property =
            (propertyData as
              | PropertyListing
              | null) ??
            null;
        }
      }

      /*
       * --------------------------------------------------------
       * RENT INVOICES
       * --------------------------------------------------------
       */

      const {
        data: invoiceData,
        error: invoiceError,
      } = await supabase
        .from('rent_invoices')
        .select('*')
        .eq(
          'renter_user_id',
          profile.id
        )
        .order('due_date', {
          ascending: false,
        })
        .limit(10);

      if (invoiceError) {
        console.warn(
          'Failed to load renter invoices:',
          invoiceError
        );
      }

      /*
       * --------------------------------------------------------
       * MOVER BOOKINGS
       * --------------------------------------------------------
       */

      const {
        data: bookingData,
        error: bookingError,
      } = await supabase
        .from('bookings')
        .select('*')
        .eq(
          'renter_id',
          profile.id
        )
        .order('moving_date', {
          ascending: true,
        })
        .limit(10);

      if (bookingError) {
        console.warn(
          'Failed to load renter bookings:',
          bookingError
        );
      }

      setData({
        association: activeAssociation,
        unit,
        property,
        invoices:
          (invoiceData as RentInvoice[]) ??
          [],
        bookings:
          (bookingData as Booking[]) ??
          [],
      });
    } catch (err) {
      console.error(
        'Failed to load renter dashboard:',
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load your renter dashboard.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (
      !authLoading &&
      profile?.role === 'renter'
    ) {
      fetchDashboard();
    }
  }, [profile?.id, profile?.role, authLoading]);

  /* ==========================================================
   * DERIVED DATA
   * ========================================================== */

  const currentInvoice = useMemo(() => {
    return data.invoices.find(
      (invoice) => {
        const status =
          invoice.status?.toLowerCase();

        return (
          status !== 'paid' &&
          status !== 'completed' &&
          status !== 'settled'
        );
      }
    );
  }, [data.invoices]);

  const activeBooking = useMemo(() => {
    return data.bookings.find((booking) => {
      const status =
        booking.status?.toLowerCase();

      return (
        status === 'pending' ||
        status === 'confirmed' ||
        status === 'accepted' ||
        status === 'in_progress' ||
        status === 'in-progress' ||
        status === 'ongoing'
      );
    });
  }, [data.bookings]);

  const upcomingBooking = useMemo(() => {
    return [...data.bookings]
      .filter(
        (booking) =>
          booking.moving_date
      )
      .sort(
        (a, b) =>
          new Date(
            a.moving_date!
          ).getTime() -
          new Date(
            b.moving_date!
          ).getTime()
      )[0];
  }, [data.bookings]);

  /* ==========================================================
   * LOADING
   * ========================================================== */

  if (
    authLoading ||
    loading
  ) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="text-center">
            <RefreshCw className="mx-auto h-8 w-8 animate-spin text-brand-500" />

            <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
              Loading your renter dashboard...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!profile || profile.role !== 'renter') {
    return null;
  }

  /* ==========================================================
   * RENDER
   * ========================================================== */

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">

      {/* ======================================================
          HEADER
      ====================================================== */}

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-brand-600 dark:text-brand-400">
            Renter Dashboard
          </p>

          <h1 className="mt-1 text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl">
            Welcome back
            {profile.full_name
              ? `, ${profile.full_name.split(' ')[0]}`
              : ''}
          </h1>

          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage your home, rent, invoices, and moving services.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchDashboard}
          className="btn-secondary inline-flex w-fit items-center gap-2 text-sm"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* ======================================================
          ERROR
      ====================================================== */}

      {error && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-800 dark:bg-error-900/20 dark:text-error-400">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />

          <div>
            <p className="font-semibold">
              Unable to load some dashboard information
            </p>

            <p className="mt-0.5">
              {error}
            </p>
          </div>
        </div>
      )}

      {/* ======================================================
          CURRENT PROPERTY
      ====================================================== */}

      <section className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white">
              Current Home
            </h2>

            <p className="text-xs text-gray-500 dark:text-gray-400">
              Your current rental property and unit
            </p>
          </div>
        </div>

        {!data.association ? (
          <div className="card p-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 dark:bg-brand-800/50">
              <Home className="h-7 w-7 text-brand-600 dark:text-brand-400" />
            </div>

            <h3 className="mt-4 text-base font-semibold text-gray-900 dark:text-white">
              No Current Property
            </h3>

            <p className="mx-auto mt-1 max-w-md text-sm text-gray-500 dark:text-gray-400">
              You are not currently a renter in any property.
              Once you are associated with a rental unit,
              your property and rent information will appear here.
            </p>

            <button
              type="button"
              onClick={() =>
                navigate('listings')
              }
              className="btn-primary mt-5 inline-flex items-center gap-2 text-sm"
            >
              <Home className="h-4 w-4" />
              Browse Listings
            </button>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="grid lg:grid-cols-[1.4fr_1fr]">

              {/* Property information */}

              <div className="p-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-800/50">
                    <Building2 className="h-6 w-6 text-brand-600 dark:text-brand-400" />
                  </div>

                  <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                      {data.property?.title ||
                        'Current Rental Property'}
                    </h3>

                    <p className="mt-1 flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
                      <MapPin className="h-4 w-4" />

                      {data.property?.city ||
                        data.property?.county ||
                        'Location unavailable'}
                    </p>
                  </div>
                </div>

                <div className="mt-6 grid gap-4 sm:grid-cols-3">

                  <div className="rounded-xl bg-gray-50 p-4 dark:bg-brand-800/40">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Unit
                    </p>

                    <p className="mt-1 font-semibold text-gray-900 dark:text-white">
                      {data.unit?.unit_number ||
                        data.unit?.name ||
                        '—'}
                    </p>
                  </div>

                  <div className="rounded-xl bg-gray-50 p-4 dark:bg-brand-800/40">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Monthly Rent
                    </p>

                    <p className="mt-1 font-semibold text-gray-900 dark:text-white">
                      {formatKES(
                        data.association?.rent_amount ??
                        data.unit?.monthly_rent ??
                        null
                      )}
                    </p>
                  </div>

                  <div className="rounded-xl bg-gray-50 p-4 dark:bg-brand-800/40">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Lease
                    </p>

                    <p className="mt-1 font-semibold text-gray-900 dark:text-white">
                      {formatDate(
                        data.association?.lease_start_date
                      )}
                    </p>
                  </div>

                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      navigate(
                        'listing-detail',
                        data.property?.id
                      )
                    }
                    disabled={!data.property?.id}
                    className="btn-secondary inline-flex items-center gap-2 text-sm"
                  >
                    View Property
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Lease information */}

              <div className="border-t border-gray-200 bg-gray-50 p-6 dark:border-brand-800 dark:bg-brand-800/20 lg:border-l lg:border-t-0">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-5 w-5 text-brand-600 dark:text-brand-400" />

                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    Lease Information
                  </h3>
                </div>

                <div className="mt-5 space-y-4">
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Lease Start
                    </p>

                    <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                      {formatDate(
                        data.association?.lease_start_date
                      )}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Lease End
                    </p>

                    <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                      {formatDate(
                        data.association?.lease_end_date
                      )}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Status
                    </p>

                    <span className="mt-1 inline-flex rounded-full bg-success-50 px-2.5 py-1 text-xs font-semibold text-success-700 dark:bg-success-900/20 dark:text-success-400">
                      {data.association?.status ||
                        'Active'}
                    </span>
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}
      </section>

      {/* ======================================================
          QUICK ACTIONS
      ====================================================== */}

      <section className="mb-6">
        <h2 className="mb-3 text-base font-bold text-gray-900 dark:text-white">
          Quick Actions
        </h2>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">

          <button
            type="button"
            onClick={() =>
              navigate('renter-invoices')
            }
            className="card group p-4 text-left transition-all hover:shadow-md"
          >
            <Receipt className="h-5 w-5 text-brand-600 dark:text-brand-400" />

            <p className="mt-3 text-sm font-semibold text-gray-900 dark:text-white">
              Rent & Invoices
            </p>

            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              View your rent invoices
            </p>

            <ArrowRight className="mt-3 h-4 w-4 text-gray-400 transition-transform group-hover:translate-x-1" />
          </button>

          <button
            type="button"
            onClick={() =>
              navigate('renter-payment')
            }
            className="card group p-4 text-left transition-all hover:shadow-md"
          >
            <CreditCard className="h-5 w-5 text-success-600 dark:text-success-400" />

            <p className="mt-3 text-sm font-semibold text-gray-900 dark:text-white">
              Add Transaction
            </p>

            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Add a payment transaction ID
            </p>

            <ArrowRight className="mt-3 h-4 w-4 text-gray-400 transition-transform group-hover:translate-x-1" />
          </button>

          <button
            type="button"
            onClick={() =>
              navigate('movers')
            }
            className="card group p-4 text-left transition-all hover:shadow-md"
          >
            <Truck className="h-5 w-5 text-accent-600 dark:text-accent-400" />

            <p className="mt-3 text-sm font-semibold text-gray-900 dark:text-white">
              Find a Mover
            </p>

            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Find moving services
            </p>

            <ArrowRight className="mt-3 h-4 w-4 text-gray-400 transition-transform group-hover:translate-x-1" />
          </button>

          <button
            type="button"
            onClick={() =>
              activeBooking
                ? navigate(
                    'mover-tracking',
                    activeBooking.id
                  )
                : navigate('movers')
            }
            className="card group p-4 text-left transition-all hover:shadow-md"
          >
            <MapPin className="h-5 w-5 text-purple-600 dark:text-purple-400" />

            <p className="mt-3 text-sm font-semibold text-gray-900 dark:text-white">
              {activeBooking
                ? 'Track Mover'
                : 'Track a Move'}
            </p>

            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {activeBooking
                ? 'View current move'
                : 'No active move'}
            </p>

            <ArrowRight className="mt-3 h-4 w-4 text-gray-400 transition-transform group-hover:translate-x-1" />
          </button>

          <button
            type="button"
            onClick={() =>
              navigate('renter-calendar')
            }
            className="card group p-4 text-left transition-all hover:shadow-md"
          >
            <CalendarDays className="h-5 w-5 text-btnblue-500" />

            <p className="mt-3 text-sm font-semibold text-gray-900 dark:text-white">
              Calendar
            </p>

            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Rent and moving dates
            </p>

            <ArrowRight className="mt-3 h-4 w-4 text-gray-400 transition-transform group-hover:translate-x-1" />
          </button>

        </div>
      </section>

      {/* ======================================================
          RENT + MOVING
      ====================================================== */}

      <div className="grid gap-6 lg:grid-cols-2">

        {/* Current invoice */}

        <section className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-gray-900 dark:text-white">
                Current Rent
              </h2>

              <p className="text-xs text-gray-500 dark:text-gray-400">
                Your latest rent invoice
              </p>
            </div>

            <Receipt className="h-5 w-5 text-brand-600 dark:text-brand-400" />
          </div>

          {!currentInvoice ? (
            <div className="py-8 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-success-500" />

              <p className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
                No outstanding invoice
              </p>

              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                You have no unpaid rent invoice at the moment.
              </p>
            </div>
          ) : (
            <div className="mt-5 rounded-xl border border-gray-200 p-4 dark:border-brand-800">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {currentInvoice.invoice_number ||
                      'Rent Invoice'}
                  </p>

                  <p className="mt-1 text-xl font-bold text-gray-900 dark:text-white">
                    {formatKES(
                      currentInvoice.total_amount ??
                      currentInvoice.amount ??
                      null
                    )}
                  </p>
                </div>

                {(() => {
                  const invoiceStatus =
                    getInvoiceStatus(
                      currentInvoice.status
                    );

                  const StatusIcon =
                    invoiceStatus.icon;

                  return (
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
                        invoiceStatus.className
                      )}
                    >
                      <StatusIcon className="h-3.5 w-3.5" />
                      {invoiceStatus.label}
                    </span>
                  );
                })()}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Due Date
                  </p>

                  <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                    {formatDate(
                      currentInvoice.due_date
                    )}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Billing Period
                  </p>

                  <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                    {formatDate(
                      currentInvoice.billing_period_start
                    )}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  navigate(
                    'renter-invoices'
                  )
                }
                className="btn-primary mt-5 inline-flex items-center gap-2 text-sm"
              >
                View Invoice
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </section>

        {/* Moving activity */}

        <section className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-gray-900 dark:text-white">
                Moving Activity
              </h2>

              <p className="text-xs text-gray-500 dark:text-gray-400">
                Your current mover activity
              </p>
            </div>

            <Truck className="h-5 w-5 text-accent-600 dark:text-accent-400" />
          </div>

          {!activeBooking ? (
            <div className="py-8 text-center">
              <Truck className="mx-auto h-8 w-8 text-gray-300 dark:text-brand-700" />

              <p className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
                No active move
              </p>

              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Book a mover whenever you need relocation assistance.
              </p>

              <button
                type="button"
                onClick={() =>
                  navigate('movers')
                }
                className="btn-secondary mt-4 inline-flex items-center gap-2 text-sm"
              >
                <Plus className="h-4 w-4" />
                Book a Mover
              </button>
            </div>
          ) : (
            <div className="mt-5 rounded-xl border border-gray-200 p-4 dark:border-brand-800">
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">
                  {getBookingStatus(
                    activeBooking.status
                  )}
                </span>

                {activeBooking.moving_date && (
                  <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {formatDate(
                      activeBooking.moving_date
                    )}
                  </span>
                )}
              </div>

              <div className="mt-4 space-y-3">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Pickup
                  </p>

                  <p className="mt-1 flex items-start gap-2 text-sm font-medium text-gray-900 dark:text-white">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />

                    {activeBooking.pickup_address ||
                      'Pickup address unavailable'}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Drop-off
                  </p>

                  <p className="mt-1 flex items-start gap-2 text-sm font-medium text-gray-900 dark:text-white">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-success-500" />

                    {activeBooking.dropoff_address ||
                      'Drop-off address unavailable'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  navigate(
                    'mover-tracking',
                    activeBooking.id
                  )
                }
                className="btn-primary mt-5 inline-flex items-center gap-2 text-sm"
              >
                Track Mover
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </section>

      </div>

      {/* ======================================================
          UPCOMING MOVE
      ====================================================== */}

      {upcomingBooking && (
        <section className="mt-6 card p-6">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-brand-600 dark:text-brand-400" />

            <h2 className="text-base font-bold text-gray-900 dark:text-white">
              Upcoming Move
            </h2>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">

            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Moving Date
              </p>

              <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                {formatDate(
                  upcomingBooking.moving_date
                )}
              </p>
            </div>

            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Pickup
              </p>

              <p className="mt-1 truncate text-sm font-semibold text-gray-900 dark:text-white">
                {upcomingBooking.pickup_address ||
                  '—'}
              </p>
            </div>

            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Drop-off
              </p>

              <p className="mt-1 truncate text-sm font-semibold text-gray-900 dark:text-white">
                {upcomingBooking.dropoff_address ||
                  '—'}
              </p>
            </div>

          </div>
        </section>
      )}

      {/* ======================================================
          FOOTER
      ====================================================== */}

      <p className="mt-8 text-center text-xs text-gray-400">
        © Copyright Saka Krib. All Rights Reserved.
      </p>

    </div>
  );
}
