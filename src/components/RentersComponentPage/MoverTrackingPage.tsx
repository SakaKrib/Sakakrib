import {
  ArrowUp,
  Car,
  CheckCircle2,
  Clock3,
  MapPin,
  Navigation,
  Phone,
  RefreshCw,
  Truck,
  User,
  XCircle,
} from 'lucide-react';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { useNav } from '@/context/NavContext';
import { renterApi } from '@/lib/Renter/renterApi';
import { cn, formatKES } from '@/lib/utils';

/* ============================================================
 * TYPES
 * ============================================================ */

interface MoverTrackingBooking {
  id: string;
  renter_id: string;
  mover_id: string;

  pickup_address: string;
  dropoff_address: string;

  moving_date: string | null;

  booking_amount: number | null;
  commission_amount: number | null;
  total_amount: number | null;

  status: string | null;
  payment_status: string | null;
  payment_method: string | null;

  distance_km: number | null;
  rate_per_km_kes: number | null;
  base_rate_kes: number | null;

  pickup_latitude: number | null;
  pickup_longitude: number | null;

  dropoff_latitude: number | null;
  dropoff_longitude: number | null;

  requested_at: string | null;
  request_expires_at: string | null;
  confirmed_at: string | null;

  scheduled_start_at: string | null;
  scheduled_end_at: string | null;

  started_at: string | null;
  completed_at: string | null;

  cancelled_at: string | null;
  cancellation_reason: string | null;
  cancellation_details: string | null;

  tracking_number: string | null;

  renter_confirmed_delivery_at: string | null;
  mover_confirmed_delivery_at: string | null;
  contact_released_at: string | null;

  last_known_latitude: number | null;
  last_known_longitude: number | null;
  last_location_at: string | null;

  dispute_status: string | null;

  created_at: string | null;
  updated_at: string | null;
}

interface MovingTrackingPoint {
  id: number;
  booking_id: string;
  mover_id: string;

  latitude: number;
  longitude: number;

  accuracy_meters: number | null;
  speed_kph: number | null;
  heading_degrees: number | null;

  recorded_at: string;
}

interface TrackingMover {
  id: string;
  user_id: string;

  driver_full_name: string | null;
  phone: string | null;
  profile_photo_url: string | null;

  vehicle_type: string | null;
  number_plate: string | null;

  operating_city: string | null;
  operating_county: string | null;

  is_available: boolean | null;

  current_latitude: number | null;
  current_longitude: number | null;

  location_updated_at: string | null;

  approval_status: string | null;
}

interface MoverTrackingResponse {
  booking: MoverTrackingBooking;
  mover: TrackingMover | null;
  tracking_points: MovingTrackingPoint[];
}

/* ============================================================
 * RESPONSE NORMALIZATION
 *
 * renterApi implementations commonly return either:
 *
 *   response
 *
 * or:
 *
 *   { data: response }
 *
 * We normalize both without blindly trusting a TypeScript cast.
 * ============================================================ */

function normalizeTrackingResponse(
  response: unknown
): MoverTrackingResponse {
  const candidate =
    response &&
    typeof response === 'object' &&
    'data' in response
      ? (response as { data?: unknown }).data
      : response;

  if (
    !candidate ||
    typeof candidate !== 'object'
  ) {
    throw new Error(
      'Invalid mover tracking response.'
    );
  }

  const value =
    candidate as Partial<MoverTrackingResponse>;

  if (
    !value.booking ||
    typeof value.booking !== 'object'
  ) {
    throw new Error(
      'Mover tracking response is missing the booking.'
    );
  }

  return {
    booking:
      value.booking as MoverTrackingBooking,

    mover:
      value.mover ?? null,

    tracking_points:
      Array.isArray(value.tracking_points)
        ? value.tracking_points
        : [],
  };
}

/* ============================================================
 * HELPERS
 * ============================================================ */

function normalizeStatus(
  status: string | null | undefined
): string {
  return (
    status
      ?.toLowerCase()
      .replace(/-/g, '_')
      .trim() ?? ''
  );
}

function formatDate(
  value: string | null | undefined
): string {
  if (!value) {
    return '—';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return date.toLocaleDateString('en-KE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateTime(
  value: string | null | undefined
): string {
  if (!value) {
    return '—';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return date.toLocaleString('en-KE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getStatusLabel(
  status: string | null | undefined
): string {
  switch (normalizeStatus(status)) {
    case 'pending':
      return 'Pending';

    case 'confirmed':
      return 'Confirmed';

    case 'scheduled':
      return 'Scheduled';

    case 'in_progress':
      return 'In Progress';

    case 'completed':
      return 'Completed';

    case 'cancelled':
    case 'canceled':
      return 'Cancelled';

    case 'expired':
    case 'request_expired':
      return 'Expired';

    default:
      return status || 'Unknown';
  }
}

function getStatusClasses(
  status: string | null | undefined
): string {
  switch (normalizeStatus(status)) {
    case 'confirmed':
      return 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400';

    case 'scheduled':
      return 'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400';

    case 'in_progress':
      return 'bg-brand-50 text-brand-700 dark:bg-brand-800/50 dark:text-brand-300';

    case 'completed':
      return 'bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-400';

    case 'pending':
      return 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400';

    case 'cancelled':
    case 'canceled':
      return 'bg-error-50 text-error-700 dark:bg-error-900/20 dark:text-error-400';

    case 'expired':
    case 'request_expired':
      return 'bg-gray-100 text-gray-700 dark:bg-brand-800 dark:text-gray-300';

    default:
      return 'bg-gray-100 text-gray-700 dark:bg-brand-800 dark:text-gray-300';
  }
}

/**
 * Live GPS tracking only belongs to the journey phase.
 *
 * Architecture:
 *
 * confirmed
 *     ↓
 * scheduled
 *     ↓
 * in_progress  ← GPS tracking
 *     ↓
 * delivery confirmation
 *     ↓
 * completed
 */
function isTrackingActive(
  status: string | null | undefined
): boolean {
  return normalizeStatus(status) === 'in_progress';
}

function isCompleted(
  status: string | null | undefined
): boolean {
  return normalizeStatus(status) === 'completed';
}

function isCancelled(
  status: string | null | undefined
): boolean {
  const normalized = normalizeStatus(status);

  return (
    normalized === 'cancelled' ||
    normalized === 'canceled'
  );
}

function formatVehicleType(
  value: string | null | undefined
): string {
  if (!value) {
    return 'Moving Vehicle';
  }

  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) =>
      char.toUpperCase()
    );
}

function formatPaymentStatus(
  value: string | null | undefined
): string {
  if (!value) {
    return '—';
  }

  return value
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (char) =>
      char.toUpperCase()
    );
}

/* ============================================================
 * COMPONENT
 * ============================================================ */

export default function MoverTrackingPage() {
  const {
    selectedMoverId,
    navigate,
  } = useNav();

  /**
   * IMPORTANT:
   *
   * The navigation context currently exposes selectedMoverId.
   * In this page it represents the SELECTED BOOKING ID.
   *
   * Ideally rename this context field later to selectedBookingId.
   */
  const bookingId = selectedMoverId;

  const [data, setData] =
    useState<MoverTrackingResponse | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  /* ==========================================================
   * LOAD TRACKING
   * ========================================================== */

  const loadTracking = useCallback(
    async (silent = false) => {
      if (!bookingId) {
        setLoading(false);
        setError(
          'No moving booking was selected.'
        );
        return;
      }

      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError(null);

      try {
        const response =
          await renterApi.getBooking(
            bookingId
          );

        const normalized =
          normalizeTrackingResponse(
            response
          );

        /**
         * Defensive client-side ownership check.
         *
         * The backend MUST still enforce renter ownership.
         * This is not a replacement for RLS/API authorization.
         */
        if (
          normalized.booking.id &&
          normalized.booking.id !== bookingId
        ) {
          throw new Error(
            'The returned booking does not match the selected booking.'
          );
        }

        setData(normalized);
      } catch (err) {
        console.error(
          'Failed to load mover tracking:',
          err
        );

        setError(
          err instanceof Error
            ? err.message
            : 'Unable to load mover tracking.'
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [bookingId]
  );

  /* ==========================================================
   * INITIAL LOAD
   * ========================================================== */

  useEffect(() => {
    void loadTracking();
  }, [loadTracking]);

  /* ==========================================================
   * AUTO REFRESH
   *
   * Only refresh while the mover is actually in progress.
   * ========================================================== */

  useEffect(() => {
    if (
      !data ||
      !isTrackingActive(
        data.booking.status
      )
    ) {
      return;
    }

    const interval =
      window.setInterval(() => {
        void loadTracking(true);
      }, 30_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [data, loadTracking]);

  /* ==========================================================
   * DERIVED DATA
   * ========================================================== */

  const booking = data?.booking ?? null;
  const mover = data?.mover ?? null;

  const trackingPoints =
    data?.tracking_points ?? [];

  const sortedTrackingPoints =
    useMemo(() => {
      return [...trackingPoints].sort(
        (a, b) =>
          new Date(
            b.recorded_at
          ).getTime() -
          new Date(
            a.recorded_at
          ).getTime()
      );
    }, [trackingPoints]);

  const latestPoint =
    sortedTrackingPoints[0] ?? null;

  /**
   * Do not treat historical GPS coordinates as
   * "live" when the journey is not active.
   */
  const currentLatitude =
    isTrackingActive(booking?.status)
      ? latestPoint?.latitude ??
        booking?.last_known_latitude ??
        null
      : null;

  const currentLongitude =
    isTrackingActive(booking?.status)
      ? latestPoint?.longitude ??
        booking?.last_known_longitude ??
        null
      : null;

  const currentSpeed =
    isTrackingActive(booking?.status)
      ? latestPoint?.speed_kph ?? null
      : null;

  const contactReleased =
    Boolean(
      booking?.contact_released_at
    );

  const renterConfirmedDelivery =
    Boolean(
      booking?.renter_confirmed_delivery_at
    );

  const moverConfirmedDelivery =
    Boolean(
      booking?.mover_confirmed_delivery_at
    );

  /* ==========================================================
   * LOADING
   * ========================================================== */

  if (loading) {
    return (
      <div className="mx-auto flex min-h-[500px] max-w-7xl items-center justify-center px-4">
        <div className="text-center">
          <RefreshCw className="mx-auto h-8 w-8 animate-spin text-brand-500" />

          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
            Loading your move tracking...
          </p>
        </div>
      </div>
    );
  }

  /* ==========================================================
   * ERROR
   * ========================================================== */

  if (error || !booking) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-error-200 bg-error-50 p-6 dark:border-error-800 dark:bg-error-900/20">
          <div className="flex items-start gap-3">
            <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-error-600" />

            <div>
              <h1 className="font-semibold text-error-800 dark:text-error-300">
                Unable to load move tracking
              </h1>

              <p className="mt-1 text-sm text-error-700 dark:text-error-400">
                {error ??
                  'The selected booking could not be found.'}
              </p>

              <button
                type="button"
                onClick={() =>
                  void loadTracking()
                }
                className="mt-4 btn-secondary text-sm"
              >
                Try again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ==========================================================
   * RENDER
   * ========================================================== */

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">

      {/* ======================================================
          HEADER
      ====================================================== */}

      <header className="mb-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

          <div>
            <button
              type="button"
              onClick={() =>
                navigate('my-bookings')
              }
              className="mb-2 text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
            >
              ← Back to bookings
            </button>

            <h1 className="text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl">
              Track Your Move
            </h1>

            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Follow your mover and keep track of your moving booking.
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              void loadTracking(true)
            }
            disabled={refreshing}
            className="btn-secondary inline-flex items-center justify-center gap-2 text-sm"
          >
            <RefreshCw
              className={cn(
                'h-4 w-4',
                refreshing &&
                  'animate-spin'
              )}
            />

            Refresh
          </button>
        </div>
      </header>

      {/* ======================================================
          STATUS
      ====================================================== */}

      <section className="mb-6">
        <div className="card p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Move Status
              </p>

              <div className="mt-2 flex flex-wrap items-center gap-3">
                <span
                  className={cn(
                    'inline-flex rounded-full px-3 py-1.5 text-sm font-semibold',
                    getStatusClasses(
                      booking.status
                    )
                  )}
                >
                  {getStatusLabel(
                    booking.status
                  )}
                </span>

                {isTrackingActive(
                  booking.status
                ) && (
                  <span className="flex items-center gap-1.5 text-xs font-medium text-success-600 dark:text-success-400">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-success-500" />
                    Live tracking active
                  </span>
                )}

                {contactReleased && (
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    Contact available
                  </span>
                )}
              </div>
            </div>

            <div className="text-left sm:text-right">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Moving Date
              </p>

              <p className="mt-1 font-semibold text-gray-900 dark:text-white">
                {formatDate(
                  booking.moving_date
                )}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ======================================================
          ROUTE
      ====================================================== */}

      <section className="mb-6">
        <div className="card p-6 sm:p-7">
          <div className="mb-6">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
              Moving Route
            </h2>

            {booking.distance_km !== null && (
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {booking.distance_km.toFixed(
                  1
                )}{' '}
                km
              </p>
            )}
          </div>

          <div className="relative">

            <div className="absolute bottom-8 left-[11px] top-8 w-px bg-gray-200 dark:bg-brand-700" />

            {/* Pickup */}

            <div className="relative flex gap-4">
              <div className="z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-800">
                <ArrowUp className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" />
              </div>

              <div className="min-w-0 pb-8">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Pickup
                </p>

                <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                  {booking.pickup_address}
                </p>
              </div>
            </div>

            {/* Dropoff */}

            <div className="relative flex gap-4">
              <div className="z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success-100 dark:bg-success-900/30">
                <MapPin className="h-3.5 w-3.5 text-success-600 dark:text-success-400" />
              </div>

              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Drop-off
                </p>

                <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                  {booking.dropoff_address}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ======================================================
          LIVE LOCATION
      ====================================================== */}

      <section className="mb-6">
        <div className="card overflow-hidden">

          <div className="border-b border-gray-200 p-5 dark:border-brand-800 sm:p-6">
            <div className="flex items-center justify-between gap-4">

              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                  Mover Location
                </h2>

                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {isTrackingActive(
                    booking.status
                  )
                    ? booking.last_location_at
                      ? `Last updated ${formatDateTime(
                          booking.last_location_at
                        )}`
                      : latestPoint
                        ? `Last recorded ${formatDateTime(
                            latestPoint.recorded_at
                          )}`
                        : 'Waiting for the mover to share a location.'
                    : normalizeStatus(
                          booking.status
                        ) === 'scheduled'
                      ? 'Live tracking will begin when the mover starts the journey.'
                      : 'Live tracking is not active for this booking.'}
                </p>
              </div>

              {isTrackingActive(
                booking.status
              ) && (
                <Navigation className="h-5 w-5 text-brand-500" />
              )}
            </div>
          </div>

          <div className="bg-gray-50 p-6 dark:bg-brand-900/30">

            {isTrackingActive(
              booking.status
            ) &&
            currentLatitude !== null &&
            currentLongitude !== null ? (
              <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-brand-800 dark:bg-brand-900">

                <div className="flex flex-col items-center text-center">

                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 dark:bg-brand-800/50">
                    <Navigation className="h-7 w-7 text-brand-600 dark:text-brand-400" />
                  </div>

                  <h3 className="mt-4 font-semibold text-gray-900 dark:text-white">
                    Mover location available
                  </h3>

                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    The mover's latest location has been received.
                  </p>

                  <div className="mt-5 grid w-full max-w-md gap-3 sm:grid-cols-2">

                    <div className="rounded-xl bg-gray-50 p-4 text-left dark:bg-brand-800/40">
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Latitude
                      </p>

                      <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                        {currentLatitude.toFixed(
                          6
                        )}
                      </p>
                    </div>

                    <div className="rounded-xl bg-gray-50 p-4 text-left dark:bg-brand-800/40">
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Longitude
                      </p>

                      <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                        {currentLongitude.toFixed(
                          6
                        )}
                      </p>
                    </div>

                  </div>

                  {currentSpeed !== null && (
                    <div className="mt-3 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                      <Navigation className="h-4 w-4" />

                      {currentSpeed.toFixed(
                        1
                      )}{' '}
                      km/h
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center dark:border-brand-700 dark:bg-brand-900">

                <MapPin className="mx-auto h-8 w-8 text-gray-400" />

                <h3 className="mt-3 font-semibold text-gray-900 dark:text-white">
                  {normalizeStatus(
                    booking.status
                  ) === 'scheduled'
                    ? 'Journey not started'
                    : isCompleted(
                          booking.status
                        )
                      ? 'Journey completed'
                      : isCancelled(
                            booking.status
                          )
                        ? 'Tracking unavailable'
                        : 'Location unavailable'}
                </h3>

                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {normalizeStatus(
                    booking.status
                  ) === 'scheduled'
                    ? 'Live mover tracking will become available once the journey starts.'
                    : isCompleted(
                          booking.status
                        )
                      ? 'Live tracking has ended because this move is complete.'
                      : isCancelled(
                            booking.status
                          )
                        ? 'Tracking is no longer available for this cancelled booking.'
                        : 'Your mover has not shared a location yet.'}
                </p>
              </div>
            )}

          </div>
        </div>
      </section>

      {/* ======================================================
          MOVER
      ====================================================== */}

      <section className="mb-6">
        <div className="card p-6 sm:p-7">

          <div className="flex flex-col gap-5 sm:flex-row">

            {mover?.profile_photo_url ? (
              <img
                src={mover.profile_photo_url}
                alt={
                  mover.driver_full_name ??
                  'Mover'
                }
                className="h-16 w-16 rounded-2xl object-cover"
              />
            ) : (
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-brand-50 dark:bg-brand-800/50">
                <User className="h-7 w-7 text-brand-600 dark:text-brand-400" />
              </div>
            )}

            <div className="min-w-0 flex-1">

              <p className="text-xs font-medium uppercase tracking-wide text-brand-600 dark:text-brand-400">
                Your Mover
              </p>

              <h2 className="mt-1 text-lg font-bold text-gray-900 dark:text-white">
                {mover?.driver_full_name ??
                  'Mover assigned'}
              </h2>

              {/* Contact is only shown after backend-controlled release. */}

              {contactReleased &&
              mover?.phone ? (
                <a
                  href={`tel:${mover.phone}`}
                  className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
                >
                  <Phone className="h-4 w-4" />

                  {mover.phone}
                </a>
              ) : (
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  Mover contact details will be available when released for this booking.
                </p>
              )}

            </div>
          </div>

          {/* Vehicle */}

          <div className="mt-6 grid gap-3 sm:grid-cols-2">

            <div className="rounded-xl bg-gray-50 p-4 dark:bg-brand-800/30">
              <div className="flex items-center gap-2">
                <Truck className="h-4 w-4 text-brand-600 dark:text-brand-400" />

                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Vehicle
                </p>
              </div>

              <p className="mt-2 font-semibold text-gray-900 dark:text-white">
                {formatVehicleType(
                  mover?.vehicle_type
                )}
              </p>
            </div>

            <div className="rounded-xl bg-gray-50 p-4 dark:bg-brand-800/30">
              <div className="flex items-center gap-2">
                <Car className="h-4 w-4 text-brand-600 dark:text-brand-400" />

                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Number Plate
                </p>
              </div>

              <p className="mt-2 font-semibold text-gray-900 dark:text-white">
                {mover?.number_plate ??
                  '—'}
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* ======================================================
          BOOKING DETAILS
      ====================================================== */}

      <section className="mb-6">
        <div className="card p-6 sm:p-7">

          <h2 className="text-lg font-bold text-gray-900 dark:text-white">
            Booking Details
          </h2>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">

            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Booking Amount
              </p>

              <p className="mt-1 font-semibold text-gray-900 dark:text-white">
                {formatKES(
                  booking.booking_amount
                )}
              </p>
            </div>

            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Total Amount
              </p>

              <p className="mt-1 font-semibold text-gray-900 dark:text-white">
                {formatKES(
                  booking.total_amount
                )}
              </p>
            </div>

            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Payment Status
              </p>

              <p className="mt-1 font-semibold text-gray-900 dark:text-white">
                {formatPaymentStatus(
                  booking.payment_status
                )}
              </p>
            </div>

            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Payment Method
              </p>

              <p className="mt-1 font-semibold text-gray-900 dark:text-white">
                {formatPaymentStatus(
                  booking.payment_method
                )}
              </p>
            </div>

            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Distance
              </p>

              <p className="mt-1 font-semibold text-gray-900 dark:text-white">
                {booking.distance_km !== null
                  ? `${booking.distance_km.toFixed(
                      1
                    )} km`
                  : '—'}
              </p>
            </div>

            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Requested
              </p>

              <p className="mt-1 font-semibold text-gray-900 dark:text-white">
                {formatDateTime(
                  booking.requested_at
                )}
              </p>
            </div>

            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Confirmed
              </p>

              <p className="mt-1 font-semibold text-gray-900 dark:text-white">
                {formatDateTime(
                  booking.confirmed_at
                )}
              </p>
            </div>

            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Scheduled Start
              </p>

              <p className="mt-1 font-semibold text-gray-900 dark:text-white">
                {formatDateTime(
                  booking.scheduled_start_at
                )}
              </p>
            </div>

            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Scheduled End
              </p>

              <p className="mt-1 font-semibold text-gray-900 dark:text-white">
                {formatDateTime(
                  booking.scheduled_end_at
                )}
              </p>
            </div>

            {booking.started_at && (
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Journey Started
                </p>

                <p className="mt-1 font-semibold text-gray-900 dark:text-white">
                  {formatDateTime(
                    booking.started_at
                  )}
                </p>
              </div>
            )}

            {booking.completed_at && (
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Completed
                </p>

                <p className="mt-1 font-semibold text-gray-900 dark:text-white">
                  {formatDateTime(
                    booking.completed_at
                  )}
                </p>
              </div>
            )}

          </div>
        </div>
      </section>

      {/* ======================================================
          DELIVERY CONFIRMATION
      ====================================================== */}

      {(booking.mover_confirmed_delivery_at ||
        booking.renter_confirmed_delivery_at ||
        isCompleted(
          booking.status
        )) && (
        <section className="mb-6">
          <div className="card p-6 sm:p-7">

            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
              Delivery Confirmation
            </h2>

            <div className="mt-5 space-y-4">

              <div className="flex items-center justify-between gap-4 rounded-xl bg-gray-50 p-4 dark:bg-brand-800/30">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    Mover confirmation
                  </p>

                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {moverConfirmedDelivery
                      ? formatDateTime(
                          booking.mover_confirmed_delivery_at
                        )
                      : 'Not yet confirmed'}
                  </p>
                </div>

                {moverConfirmedDelivery ? (
                  <CheckCircle2 className="h-5 w-5 text-success-600 dark:text-success-400" />
                ) : (
                  <Clock3 className="h-5 w-5 text-gray-400" />
                )}
              </div>

              <div className="flex items-center justify-between gap-4 rounded-xl bg-gray-50 p-4 dark:bg-brand-800/30">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    Your confirmation
                  </p>

                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {renterConfirmedDelivery
                      ? formatDateTime(
                          booking.renter_confirmed_delivery_at
                        )
                      : 'Not yet confirmed'}
                  </p>
                </div>

                {renterConfirmedDelivery ? (
                  <CheckCircle2 className="h-5 w-5 text-success-600 dark:text-success-400" />
                ) : (
                  <Clock3 className="h-5 w-5 text-gray-400" />
                )}
              </div>

            </div>
          </div>
        </section>
      )}

      {/* ======================================================
          TRACKING HISTORY
      ====================================================== */}

      {sortedTrackingPoints.length > 0 && (
        <section className="mb-6">
          <div className="card p-6 sm:p-7">

            <div className="flex items-center gap-2">
              <Clock3 className="h-5 w-5 text-brand-600 dark:text-brand-400" />

              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                Tracking History
              </h2>
            </div>

            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Recent mover location updates for this booking.
            </p>

            <div className="mt-5 space-y-3">

              {sortedTrackingPoints
                .slice(0, 10)
                .map((point) => (
                  <div
                    key={point.id}
                    className="flex items-center justify-between gap-4 rounded-xl bg-gray-50 p-4 dark:bg-brand-800/30"
                  >
                    <div className="flex min-w-0 items-center gap-3">

                      <MapPin className="h-4 w-4 shrink-0 text-brand-500" />

                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {point.latitude.toFixed(
                            5
                          )}
                          ,{' '}
                          {point.longitude.toFixed(
                            5
                          )}
                        </p>

                        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                          {formatDateTime(
                            point.recorded_at
                          )}
                        </p>
                      </div>
                    </div>

                    {point.speed_kph !== null && (
                      <span className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400">
                        {point.speed_kph.toFixed(
                          1
                        )}{' '}
                        km/h
                      </span>
                    )}
                  </div>
                ))}

            </div>
          </div>
        </section>
      )}

      {/* ======================================================
          COMPLETION
      ====================================================== */}

      {isCompleted(
        booking.status
      ) && (
        <section className="mb-6">
          <div className="rounded-2xl border border-success-200 bg-success-50 p-6 dark:border-success-800 dark:bg-success-900/20">

            <div className="flex items-start gap-3">

              <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-success-600 dark:text-success-400" />

              <div>
                <h2 className="font-bold text-success-800 dark:text-success-300">
                  Move completed
                </h2>

                <p className="mt-1 text-sm text-success-700 dark:text-success-400">
                  This moving journey has been completed.
                </p>

                {booking.completed_at && (
                  <p className="mt-2 text-xs text-success-600 dark:text-success-500">
                    Completed{' '}
                    {formatDateTime(
                      booking.completed_at
                    )}
                  </p>
                )}

                {renterConfirmedDelivery &&
                  moverConfirmedDelivery && (
                    <p className="mt-2 text-xs font-medium text-success-700 dark:text-success-400">
                      Delivery has been confirmed by both parties.
                    </p>
                  )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ======================================================
          CANCELLED
      ====================================================== */}

      {isCancelled(
        booking.status
      ) && (
        <section className="mb-6">
          <div className="rounded-2xl border border-error-200 bg-error-50 p-6 dark:border-error-800 dark:bg-error-900/20">

            <div className="flex items-start gap-3">

              <XCircle className="mt-0.5 h-6 w-6 shrink-0 text-error-600 dark:text-error-400" />

              <div>
                <h2 className="font-bold text-error-800 dark:text-error-300">
                  Booking cancelled
                </h2>

                {booking.cancellation_reason && (
                  <p className="mt-1 text-sm text-error-700 dark:text-error-400">
                    {booking.cancellation_reason}
                  </p>
                )}

                {booking.cancellation_details && (
                  <p className="mt-2 text-sm text-error-700 dark:text-error-400">
                    {booking.cancellation_details}
                  </p>
                )}

                {booking.cancelled_at && (
                  <p className="mt-2 text-xs text-error-600 dark:text-error-500">
                    Cancelled{' '}
                    {formatDateTime(
                      booking.cancelled_at
                    )}
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

    </div>
  );
};