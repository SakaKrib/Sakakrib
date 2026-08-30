import { useState, useEffect } from 'react';
import {
  Chrome as Home,
  Building2,
  Truck,
  LayoutDashboard,
  ShieldCheck,
  Clock,
  Calendar,
  TrendingUp,
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import RealEstateDashboard from './Realestatedashboard';

import { protectedGet } from '@/lib/protectedApi';
import {
  formatKES,
  cn,
  getPlatformSettings,
} from '@/lib/utils';
import { fetchListingEntitlement, type ListingEntitlement } from '@/lib/ListingEntitlement';

import type {
  UserRole,
  Listing,
  Mover,
  Booking,
  Review,
} from '@/lib/supabase';

import AdminDashboard from '@/Dashboards/AdminDashboard';
import LandlordDashboard from '@/Dashboards/LandlordDashboard';

type SimRole = UserRole | 'role-selection';

export default function DashboardPage() {
  const { profile } = useAuth();

  const {
    navigate,
    simulatorRole,
  } = useNav();

  const [listings, setListings] = useState<Listing[]>([]);
  const [moverProfile, setMoverProfile] =
    useState<Mover | null>(null);

  const [bookings, setBookings] = useState<
    (Booking & { mover?: Mover })[]
  >([]);

  const [reviews, setReviews] = useState<Review[]>([]);

  /*
   * ============================================================
   * DATABASE CONFIGURATION
   * ============================================================
   *
   * These are intentionally null until Supabase returns the
   * authoritative values.
   *
   * We DO NOT use:
   *
   *   0.10
   *   1000
   *   3
   *
   * anywhere in this component.
   */

  const [platformSettings, setPlatformSettings] =
    useState<
      Awaited<ReturnType<typeof getPlatformSettings>> | null
    >(null);

  const [listingEntitlement, setListingEntitlement] =
    useState<ListingEntitlement | null>(null);

  const [configurationLoading, setConfigurationLoading] =
    useState(true);

  const isAdmin =
    profile?.is_admin === true ||
    profile?.role === 'admin';

  /*
   * ============================================================
   * FETCH DASHBOARD DATA
   * ============================================================
   */

    useEffect(() => {
      if (!profile) {
        return;
      }

      let cancelled = false;

      const fetchData = async () => {
        setConfigurationLoading(true);

        try {
          const isListingRole =
            profile.role === 'landlord' 

          /*
          * Fetch normal dashboard data independently.
          * A failure in one area must not erase valid
          * configuration returned by another area.
          */
          const [
            listingResponse,
            moverResponse,
            bookingResponse,
            reviewResponse,
          ] = await Promise.all([
            protectedGet<Listing[]>(
              '/rest/v1/listings?select=*&order=created_at.desc'
            ),

            protectedGet<Mover | null>(
              '/rest/v1/movers?select=*&limit=1'
            ).then((rows) =>
              Array.isArray(rows)
                ? rows[0] ?? null
                : rows
            ),

            protectedGet<(Booking & { mover?: Mover })[]>(
              '/rest/v1/bookings?select=*,mover:movers(*)&order=created_at.desc'
            ),

            protectedGet<Review[]>(
              '/rest/v1/reviews?select=*&order=created_at.desc'
            ),
          ]);

          if (cancelled) {
            return;
          }

          setListings(
            Array.isArray(listingResponse)
              ? listingResponse
              : []
          );

          setMoverProfile(
            moverResponse as Mover | null
          );

          setBookings(
            Array.isArray(bookingResponse)
              ? bookingResponse
              : []
          );

          setReviews(
            Array.isArray(reviewResponse)
              ? reviewResponse
              : []
          );

          /*
          * ========================================================
          * PLATFORM SETTINGS
          * ========================================================
          *
          * Keep this independent from listing entitlement.
          */
          try {
            const settings = await getPlatformSettings();

            if (!cancelled) {
              setPlatformSettings(settings);
            }
          } catch (error) {
            console.error(
              'Failed to load platform settings:',
              error
            );

            if (!cancelled) {
              setPlatformSettings(null);
            }
          }

          /*
          * ========================================================
          * LISTING ENTITLEMENT
          * ========================================================
          *
          * Landlord:
          *   get_landlord_listing_entitlement()
          *
          * Real estate:
          *   get_real_estate_listing_entitlement()
          *
          * These remain completely separate.
          */
          if (isListingRole) {
            try {
              const entitlement =
                await fetchListingEntitlement(
                  profile.role as
                    | 'landlord'
                    | 'real_estate',
                  profile.id
                );

              console.log(
                '[Dashboard] Listing entitlement:',
                entitlement
              );

              if (!cancelled) {
                setListingEntitlement(entitlement);
              }
            } catch (error) {
              console.error(
                'Failed to load listing entitlement:',
                error
              );

              if (!cancelled) {
                setListingEntitlement(null);
              }
            }
          } else {
            if (!cancelled) {
              setListingEntitlement(null);
            }
          }
        } catch (error) {
          console.error(
            'Failed to load dashboard data:',
            error
          );
        } finally {
          if (!cancelled) {
            setConfigurationLoading(false);
          }
        }
      };

      void fetchData();

      return () => {
        cancelled = true;
      };
    }, [profile]);


  /*
   * ============================================================
   * AUTHENTICATION
   * ============================================================
   */

  if (!profile) {
    return (
      <div className="mx-auto max-w-md px-2 py-20 text-center">
        <p className="text-gray-500 dark:text-gray-400">
          Please sign in to access your dashboard.
        </p>
      </div>
    );
  }

  /*
   * ============================================================
   * KYC
   * ============================================================
   */

  if (!profile.kyc_completed && !isAdmin) {
    return (
      <div className="mx-auto max-w-md px-2 py-20">
        <div className="card p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-warning-50 dark:bg-warning-900/30">
            <ShieldCheck className="h-7 w-7 text-warning-600 dark:text-warning-400" />
          </div>

          <h2 className="mt-5 text-xl font-bold text-gray-900 dark:text-white">
            Complete your KYC verification
          </h2>

          <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
            Please complete your identity verification before
            continuing with your account registration.
          </p>

          <button
            type="button"
            onClick={() => navigate('kyc-verify')}
            className="btn-primary mt-6"
          >
            <ShieldCheck className="h-4 w-4" />
            Complete KYC
          </button>
        </div>
      </div>
    );
  }

  /*
   * ============================================================
   * LANDLORD APPLICATION
   * ============================================================
   */

  if (
    profile.landlord_application_status ===
    'pending'
  ) {
    return (
      <div className="mx-auto max-w-md px-2 py-20">
        <div className="card p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-warning-50 dark:bg-warning-900/30">
            <Clock className="h-7 w-7 text-warning-600 dark:text-warning-400" />
          </div>

          <h2 className="mt-5 text-xl font-bold text-gray-900 dark:text-white">
            Landlord application under review
          </h2>

          <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
            Your landlord application has been submitted and
            is currently being reviewed by our administration
            team.
          </p>

          <div className="mt-5 rounded-xl border border-warning-200 bg-warning-50 p-4 text-left dark:border-warning-800 dark:bg-warning-900/20">
            <div className="flex gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-warning-600 dark:text-warning-400" />

              <div>
                <p className="font-semibold text-warning-900 dark:text-warning-200">
                  Verification pending
                </p>

                <p className="mt-1 text-sm leading-6 text-warning-800 dark:text-warning-300">
                  You will receive an update once your identity
                  and landlord application have been reviewed.
                  Landlord dashboard features will become
                  available after approval.
                </p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate('profile')}
            className="btn-secondary mt-6"
          >
            View Profile
          </button>
        </div>
      </div>
    );
  }

  /*
   * ============================================================
   * ROLE
   * ============================================================
   */

  const activeRole = isAdmin
    ? simulatorRole || profile.role
    : profile.role;

  /*
   * Admin dashboard
   */
  if (isAdmin) {
    return <AdminDashboard />;
  }


  /*
   * landlord/ real-estate dashboard
   */
  if (profile?.role === 'real_estate') {
    return <RealEstateDashboard />;
  }

  if (profile?.role === 'landlord') {
    return <LandlordDashboard />;
  }

  /*
   * ============================================================
   * AUTHORITATIVE DATABASE VALUES
   * ============================================================
   *
   * IMPORTANT:
   *
   * These names are intentionally preserved because other parts
   * of the application already refer to these concepts.
   *
   * But their values are NOT hardcoded.
   *
   * COMMISSION_RATE
   *   -> platform_settings.mover_commission_rate
   *
   * LISTING_FEE_KES
   *   -> listing entitlement.individual_listing_price_kes
   *
   * FREE_LISTING_LIMIT
   *   -> listing entitlement.free_limit
   */

 const COMMISSION_RATE =
  platformSettings?.mover_commission_rate != null
    ? Number(platformSettings.mover_commission_rate)
    : null;

const LISTING_FEE_KES =
  listingEntitlement?.individualListingPriceKes ?? null;

const FREE_LISTING_LIMIT =
  listingEntitlement?.free_limit ?? null;

  /*
   * Additional authoritative configuration.
   */

  const MOVER_OPERATIONAL_MARKUP_RATE =
    platformSettings !== null
      ? Number(
          platformSettings.mover_operational_markup_rate
        )
      : null;

  const FREE_LISTINGS_USED =
    listingEntitlement !== null
      ? Number(
          listingEntitlement.free_listings_used
        )
      : null;

  const FREE_LISTINGS_REMAINING =
    listingEntitlement !== null
      ? Number(
          listingEntitlement.free_listings_remaining
        )
      : null;

  /*
   * ============================================================
   * MAIN DASHBOARD
   * ============================================================
   */

  return (
    <div className="mx-auto max-w-7xl px-2 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">
          <LayoutDashboard className="h-6 w-6 text-brand-600" />
          Dashboard
        </h1>

        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Manage your listings, bookings, and profile.
        </p>
      </div>

      {/* ======================================================
          LANDLORD / REAL ESTATE
          ====================================================== */}

      {(activeRole === 'landlord' ||
        activeRole === 'real_estate') && (
        <LandlordDashboard />
      )}

      {/* ======================================================
          MOVER
          ====================================================== */}

      {activeRole === 'mover' && (
        <div className="card mb-6 p-6">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
              <Truck className="h-5 w-5 text-accent-600" />
              Mover Profile
            </h3>

            {!moverProfile && (
              <button
                onClick={() =>
                  navigate('register-mover')
                }
                className="btn-primary text-sm"
              >
                Register as Mover
              </button>
            )}
          </div>

          {moverProfile ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-full bg-gray-50 p-4 dark:bg-brand-800/30">
                <p className="text-xs text-gray-400">
                  Vehicle
                </p>

                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {moverProfile.vehicle_type ===
                  'pickup'
                    ? 'Pickup Truck'
                    : moverProfile.vehicle_type ===
                        'lorry'
                      ? 'Lorry / Canter'
                      : 'Trailer'}
                </p>
              </div>

              <div className="rounded-full bg-gray-50 p-4 dark:bg-brand-800/30">
                <p className="text-xs text-gray-400">
                  Number Plate
                </p>

                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {moverProfile.number_plate}
                </p>
              </div>

              <div className="rounded-full bg-gray-50 p-4 dark:bg-brand-800/30">
                <p className="text-xs text-gray-400">
                  Operating Area
                </p>

                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {moverProfile.operating_city},{' '}
                  {moverProfile.operating_county}
                </p>
              </div>

              <div className="rounded-full bg-gray-50 p-4 dark:bg-brand-800/30">
                <p className="text-xs text-gray-400">
                  Base Rate
                </p>

                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {moverProfile.base_rate_kes > 0
                    ? formatKES(
                        moverProfile.base_rate_kes
                      )
                    : 'On request'}
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
              You haven't registered as a mover yet.
              Complete registration to start accepting jobs.
            </p>
          )}
        </div>
      )}

      {/* ======================================================
          RENTER BOOKINGS
          ====================================================== */}

      {activeRole === 'renter' && (
        <div className="card mb-6 p-6">
          <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
            <Calendar className="h-5 w-5 text-brand-600" />
            My Bookings
          </h3>

          {bookings.length === 0 ? (
            <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
              No bookings yet. Browse movers to book a move!
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {bookings.map((booking) => (
                <div
                  key={booking.id}
                  className="rounded-full border border-gray-200 p-4 dark:border-brand-800"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        {booking.mover
                          ?.driver_full_name ||
                          'Mover'}
                      </p>

                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {booking.pickup_address} →{' '}
                        {booking.dropoff_address}
                      </p>

                      <p className="text-xs text-gray-400">
                        Date: {booking.moving_date}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-sm font-bold text-brand-600 dark:text-brand-400">
                        {formatKES(
                          booking.total_amount
                        )}
                      </p>

                      <span
                        className={cn(
                          'badge mt-1',
                          booking.status ===
                            'completed'
                            ? 'bg-success-50 text-success-700 dark:bg-success-900/30 dark:text-success-400'
                            : booking.status ===
                                'pending'
                              ? 'bg-warning-50 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400'
                              : booking.status ===
                                  'confirmed'
                                ? 'bg-brand-50 text-brand-700 dark:bg-brand-800 dark:text-brand-200'
                                : 'bg-error-50 text-error-700 dark:bg-error-900/30 dark:text-error-400'
                        )}
                      >
                        {booking.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ======================================================
          PLATFORM FEES & COMMISSION
          ====================================================== */}

      <div className="card p-6">
        <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
          <TrendingUp className="h-5 w-5 text-brand-600" />
          Platform Fees & Commission
        </h3>

        <div className="mt-4 space-y-3">
          {/* ==================================================
              LANDLORD LISTING FEE
              ================================================== */}

          <div className="flex items-center justify-between rounded-full bg-gray-50 p-3 dark:bg-brand-800/30">
            <div className="flex items-center gap-2">
              <Home className="h-4 w-4 text-gray-400" />

              <span className="text-sm text-gray-600 dark:text-gray-400">
                Landlord listing fee
                {FREE_LISTING_LIMIT !== null
                  ? ` (after ${FREE_LISTING_LIMIT} free)`
                  : ''}
              </span>
            </div>

            <span className="text-sm font-semibold text-gray-900 dark:text-white">
              {configurationLoading
                ? 'Loading...'
                : LISTING_FEE_KES !== null
                  ? `${formatKES(
                      LISTING_FEE_KES
                    )} / listing`
                  : 'Not configured'}
            </span>
          </div>

          {/* ==================================================
              MOVER COMMISSION
              ================================================== */}

          <div className="flex items-center justify-between rounded-full bg-gray-50 p-3 dark:bg-brand-800/30">
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-gray-400" />

              <span className="text-sm text-gray-600 dark:text-gray-400">
                Mover booking commission
              </span>
            </div>

            <span className="text-sm font-semibold text-gray-900 dark:text-white">
              {configurationLoading
                ? 'Loading...'
                : COMMISSION_RATE !== null
                  ? `${(
                      COMMISSION_RATE * 100
                    ).toLocaleString('en-KE', {
                      maximumFractionDigits: 2,
                    })}% per booking`
                  : 'Not configured'}
            </span>
          </div>

          {/* ==================================================
              MOVER OPERATIONAL MARKUP
              ================================================== */}

          <div className="flex items-center justify-between rounded-full bg-gray-50 p-3 dark:bg-brand-800/30">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-gray-400" />

              <span className="text-sm text-gray-600 dark:text-gray-400">
                Mover operational markup
              </span>
            </div>

            <span className="text-sm font-semibold text-gray-900 dark:text-white">
              {configurationLoading
                ? 'Loading...'
                : MOVER_OPERATIONAL_MARKUP_RATE !==
                    null
                  ? `${(
                      MOVER_OPERATIONAL_MARKUP_RATE *
                      100
                    ).toLocaleString('en-KE', {
                      maximumFractionDigits: 2,
                    })}%`
                  : 'Not configured'}
            </span>
          </div>

          {/* ==================================================
              FREE LISTINGS REMAINING
              ================================================== */}

          {FREE_LISTINGS_REMAINING !== null && (
            <div className="flex items-center justify-between rounded-full bg-gray-50 p-3 dark:bg-brand-800/30">
              <div className="flex items-center gap-2">
                <Home className="h-4 w-4 text-gray-400" />

                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Free listings remaining
                </span>
              </div>

              <span className="text-sm font-semibold text-gray-900 dark:text-white">
                {FREE_LISTINGS_REMAINING}
              </span>
            </div>
          )}

          {/* ==================================================
              FREE LISTINGS USED
              ================================================== */}

          {FREE_LISTINGS_USED !== null && (
            <div className="flex items-center justify-between rounded-full bg-gray-50 p-3 dark:bg-brand-800/30">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-gray-400" />

                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Free listings used
                </span>
              </div>

              <span className="text-sm font-semibold text-gray-900 dark:text-white">
                {FREE_LISTINGS_USED}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  onClick,
}: {
  icon: typeof Home;
  label: string;
  value: number;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        'card p-4 text-left transition-all',
        onClick &&
          'cursor-pointer hover:shadow-md'
      )}
    >
      <div className="flex items-center justify-between">
        <Icon className="h-5 w-5 text-gray-400" />

        {onClick && (
          <TrendingUp className="h-3 w-3 text-gray-300" />
        )}
      </div>

      <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
        {value}
      </p>

      <p className="text-xs text-gray-500 dark:text-gray-400">
        {label}
      </p>
    </button>
  );
}