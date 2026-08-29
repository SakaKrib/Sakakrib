import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Bell,
  MessageCircle,
  RefreshCw,
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import { cn } from '@/lib/utils';

import { renterApi } from '@/lib/Renter/renterApi';

import RenterWelcome from '@/pages/Renters/RenterWelcome';
import RenterPropertyCard from '@/pages/Renters/RenterPropertyCard';
import RenterRentCard from '@/pages/Renters/RenterRentCard';
import RenterMoveCard from '@/pages/Renters/RenterMovingCard';

import RenterQuickActions, {
  type RenterQuickAction,
} from '@/pages/Renters/RenterQuickActions';

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

interface RenterDashboardResponse {
  association: RenterAssociation | null;
  unit: PropertyUnit | null;
  property: PropertyListing | null;
  invoices: RentInvoice[];
  bookings: Booking[];
}

interface RenterDashboardData {
  association: RenterAssociation | null;
  unit: PropertyUnit | null;
  property: PropertyListing | null;
  invoices: RentInvoice[];
  bookings: Booking[];
}

/* ============================================================
 * DEFAULT STATE
 * ============================================================ */

const EMPTY_DASHBOARD: RenterDashboardData = {
  association: null,
  unit: null,
  property: null,
  invoices: [],
  bookings: [],
};

/* ============================================================
 * HELPERS
 * ============================================================ */

function isUnpaidInvoice(invoice: RentInvoice) {
  const status = invoice.status?.toLowerCase();

  return !['paid', 'completed', 'settled'].includes(status ?? '');
}

function isActiveBooking(booking: Booking) {
  const status = booking.status?.toLowerCase();

  return [
    'pending',
    'confirmed',
    'accepted',
    'in_progress',
    'in-progress',
    'ongoing',
  ].includes(status ?? '');
}

/* ============================================================
 * COMPONENT
 *
 * BODY ONLY
 *
 * The application-level navbar/footer/layout should be supplied
 * by the existing website layout.
 * ============================================================ */

export default function RenterDashboard() {
  const { profile, loading: authLoading } = useAuth();
  const { navigate } = useNav();

  const [data, setData] =
    useState<RenterDashboardData>(EMPTY_DASHBOARD);

  const [loading, setLoading] = useState(true);
  const [error, setError] =
    useState<string | null>(null);

  /* ==========================================================
   * AUTH GUARD
   * ========================================================== */

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!profile) {
      navigate('home');
      return;
    }

    if (profile.role !== 'renter') {
      navigate('home');
    }
  }, [
    authLoading,
    profile,
    navigate,
  ]);

  /* ==========================================================
   * LOAD DASHBOARD
   * ========================================================== */

  const loadDashboard = useCallback(async () => {
    if (
      !profile ||
      profile.role !== 'renter'
    ) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response: RenterDashboardResponse =
        await renterApi.getDashboard();

      setData({
        association:
          response?.association ?? null,

        unit:
          response?.unit ?? null,

        property:
          response?.property ?? null,

        invoices:
          Array.isArray(response?.invoices)
            ? response.invoices
            : [],

        bookings:
          Array.isArray(response?.bookings)
            ? response.bookings
            : [],
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

      setData(EMPTY_DASHBOARD);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  /* ==========================================================
   * INITIAL LOAD
   * ========================================================== */

  useEffect(() => {
    if (
      !authLoading &&
      profile?.role === 'renter'
    ) {
      void loadDashboard();
    }
  }, [
    authLoading,
    profile?.role,
    loadDashboard,
  ]);

  /* ==========================================================
   * DERIVED DATA
   * ========================================================== */

  const currentInvoice = useMemo(() => {
    return (
      data.invoices.find(isUnpaidInvoice) ??
      null
    );
  }, [data.invoices]);

  const activeBooking = useMemo(() => {
    return (
      data.bookings.find(isActiveBooking) ??
      null
    );
  }, [data.bookings]);

  const monthlyRent =
    data.association?.rent_amount ??
    data.unit?.monthly_rent ??
    null;

  /* ==========================================================
   * QUICK ACTIONS
   * ========================================================== */

  const handleQuickAction = useCallback(
    (action: RenterQuickAction) => {
      switch (action) {
        case 'invoices':
          navigate('renter-invoices');
          break;

        case 'payment':
          navigate('renter-payment');
          break;

        case 'find-mover':
          navigate('movers');
          break;

        case 'track-move':
          if (activeBooking) {
            navigate(
              'mover-tracking',
              activeBooking.id
            );
          } else {
            navigate('movers');
          }
          break;

        case 'calendar':
          navigate('renter-calendar');
          break;

        default:
          break;
      }
    },
    [activeBooking, navigate]
  );

  /* ==========================================================
   * LOADING
   * ========================================================== */

  if (authLoading || loading) {
    return (
      <div className="mx-auto flex min-h-[400px] max-w-7xl items-center justify-center px-2 py-8 sm:px-6 lg:px-8">
        <div className="text-center">
          <RefreshCw className="mx-auto h-8 w-8 animate-spin text-brand-500" />

          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
            Loading your renter dashboard...
          </p>
        </div>
      </div>
    );
  }

  /* ==========================================================
   * INVALID ACCESS
   * ========================================================== */

  if (
    !profile ||
    profile.role !== 'renter'
  ) {
    return null;
  }

  /* ==========================================================
   * DASHBOARD BODY
   * ========================================================== */

  return (
    <div className="mx-auto max-w-7xl px-2 py-8 sm:px-6 lg:px-8">

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

        <div className="flex items-center gap-2">

          {/* NOTIFICATIONS */}

          <button
            type="button"
            onClick={() =>
              navigate('notifications')
            }
            aria-label="Notifications"
            title="Notifications"
            className={cn(
              'relative flex h-10 w-10 items-center justify-center',
              'rounded-xl border border-gray-200',
              'bg-white text-gray-600',
              'transition-colors hover:bg-gray-50',
              'focus:outline-none focus:ring-2 focus:ring-brand-500/30',
              'dark:border-brand-800',
              'dark:bg-brand-900/40',
              'dark:text-gray-300',
              'dark:hover:bg-brand-800/60'
            )}
          >
            <Bell className="h-5 w-5" />
          </button>

          {/* MESSAGES */}

          <button
            type="button"
            onClick={() =>
              navigate('chat')
            }
            aria-label="Messages"
            title="Messages"
            className={cn(
              'relative flex h-10 w-10 items-center justify-center',
              'rounded-xl border border-gray-200',
              'bg-white text-gray-600',
              'transition-colors hover:bg-gray-50',
              'focus:outline-none focus:ring-2 focus:ring-brand-500/30',
              'dark:border-brand-800',
              'dark:bg-brand-900/40',
              'dark:text-gray-300',
              'dark:hover:bg-brand-800/60'
            )}
          >
            <MessageCircle className="h-5 w-5" />
          </button>

          {/* REFRESH */}

          <button
            type="button"
            onClick={() =>
              void loadDashboard()
            }
            disabled={loading}
            aria-label="Refresh dashboard"
            className="btn-secondary inline-flex items-center gap-2 text-sm"
          >
            <RefreshCw
              className={cn(
                'h-4 w-4',
                loading &&
                  'animate-spin'
              )}
            />

            <span className="hidden sm:inline">
              Refresh
            </span>
          </button>

        </div>
      </div>

      {/* ======================================================
          ERROR
      ====================================================== */}

      {error && (
        <div className="mb-6 flex items-start justify-between gap-3 rounded-lg bg-error-50 px-4 py-3 text-sm text-error-700 dark:bg-error-900/20 dark:text-error-400">

          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />

            <div>
              <p className="font-semibold">
                Unable to load dashboard
              </p>

              <p className="mt-0.5 break-words">
                {error}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() =>
              setError(null)
            }
            className="shrink-0 rounded-lg p-1 hover:bg-error-100 dark:hover:bg-error-900/40"
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}

      {/* ======================================================
          WELCOME
      ====================================================== */}

      <section className="mb-6">
        <RenterWelcome
          profile={profile}
        />
      </section>

      {/* ======================================================
          PROPERTY
      ====================================================== */}

      <section className="card mb-6 overflow-hidden">

        <div className="border-b border-gray-200 bg-gradient-to-r from-brand-50 to-brand-100 px-5 py-4 dark:border-brand-800 dark:from-brand-800/50 dark:to-brand-900/50">

          <h2 className="flex items-center gap-2 font-bold text-gray-900 dark:text-white">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-100 text-brand-600 dark:bg-brand-800 dark:text-brand-300">
              🏠
            </span>

            My Home
          </h2>

          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            View your current rental property and unit details.
          </p>

        </div>

        <div className="p-5">
          <RenterPropertyCard
            data={{
              property: data.property
                ? {
                    id: data.property.id,
                    title: data.property.title,
                    city: data.property.city,
                    county: data.property.county,
                    address: data.property.address,
                    cover_image_url:
                      data.property.cover_image_url,
                  }
                : null,

              unit: data.unit
                ? {
                    id: data.unit.id,
                    unit_number:
                      data.unit.unit_number,
                    name: data.unit.name,
                    monthly_rent:
                      data.unit.monthly_rent,
                  }
                : null,

              association:
                data.association
                  ? {
                      status:
                        data.association.status,

                      rent_amount:
                        data.association.rent_amount,

                      lease_start_date:
                        data.association
                          .lease_start_date,

                      lease_end_date:
                        data.association
                          .lease_end_date,
                    }
                  : null,
            }}

            onViewProperty={(propertyId) =>
              navigate(
                'listing-detail',
                propertyId
              )
            }
          />
        </div>
      </section>

      {/* ======================================================
          QUICK ACTIONS
      ====================================================== */}

      <section className="card mb-6 overflow-hidden">

        <div className="border-b border-gray-200 bg-gradient-to-r from-brand-50 to-brand-100 px-5 py-4 dark:border-brand-800 dark:from-brand-800/50 dark:to-brand-900/50">

          <h2 className="font-bold text-gray-900 dark:text-white">
            Quick Actions
          </h2>

          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Quickly access the renter services you use most.
          </p>

        </div>

        <div className="p-5">
          <RenterQuickActions
            onAction={handleQuickAction}
            hasActiveMove={Boolean(
              activeBooking
            )}
          />
        </div>
      </section>

      {/* ======================================================
          RENT + MOVING
      ====================================================== */}

      <div className="grid gap-6 lg:grid-cols-2">

        {/* ====================================================
            RENT
        ==================================================== */}

        <div className="card overflow-hidden">

          <div className="border-b border-gray-200 bg-gradient-to-r from-success-50 to-brand-50 px-5 py-4 dark:border-brand-800 dark:from-success-900/20 dark:to-brand-900/30">

            <h2 className="font-bold text-gray-900 dark:text-white">
              Rent & Payments
            </h2>

            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Keep track of your rent, invoices, and payments.
            </p>

          </div>

          <div className="p-5">
            <RenterRentCard
              invoice={currentInvoice}
              monthlyRent={monthlyRent}
              onViewInvoices={() =>
                navigate(
                  'renter-invoices'
                )
              }
            />
          </div>
        </div>

        {/* ====================================================
            MOVING
        ==================================================== */}

        <div className="card overflow-hidden">

          <div className="border-b border-gray-200 bg-gradient-to-r from-brand-50 to-brand-100 px-5 py-4 dark:border-brand-800 dark:from-brand-800/50 dark:to-brand-900/50">

            <h2 className="font-bold text-gray-900 dark:text-white">
              Moving Services
            </h2>

            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Find movers and track your moving requests.
            </p>

          </div>

          <div className="p-5">
            <RenterMoveCard
              booking={activeBooking}
              onFindMover={() =>
                navigate('movers')
              }
              onTrack={(bookingId) =>
                navigate(
                  'mover-tracking',
                  bookingId
                )
              }
            />
          </div>
        </div>

      </div>

    </div>
  );
};