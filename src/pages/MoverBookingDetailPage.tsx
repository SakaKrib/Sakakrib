import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Loader2,
  MapPin,
  RefreshCw,
  Truck,
  User,
  XCircle,
} from 'lucide-react';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useNav } from '@/context/NavContext';
import { supabase } from '@/lib/supabase';
import { cn, formatKES } from '@/lib/utils';

/* ============================================================
 * TYPES
 * ============================================================ */

interface MoverBookingDetailBooking {
  id: string;
  renter_id: string;
  mover_id: string;
  listing_id: string | null;

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

  dispute_status: string | null;

  created_at: string | null;
  updated_at: string | null;
}

interface MoverBookingDetailRenter {
  id: string;
  full_name: string | null;
  phone: string | null;
  profile_photo_url: string | null;
  city: string | null;
  county: string | null;
}

interface MoverBookingDetailMover {
  id: string;
  driver_full_name: string | null;
  business_name: string | null;
  phone: string | null;
  vehicle_type: string | null;
  number_plate: string | null;
  operating_city: string | null;
  operating_county: string | null;
  base_rate_kes: number | null;
  rate_per_km_kes: number | null;
  approval_status: string | null;
}

interface MoverBookingSchedule {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  title: string;
}

interface MoverBookingDetailResponse {
  booking: MoverBookingDetailBooking;
  renter: MoverBookingDetailRenter | null;
  mover: MoverBookingDetailMover | null;
  schedule: MoverBookingSchedule | null;
  response_deadline: string | null;
  can_respond: boolean;
  contact_released?: boolean;
}

type Decision = 'confirm' | 'not_sure' | 'cancel';

/* ============================================================
 * HELPERS
 * ============================================================ */

function normalizeStatus(value: string | null | undefined) {
  return value?.toLowerCase().replace(/-/g, '_').trim() ?? '';
}

function statusLabel(value: string | null | undefined) {
  switch (normalizeStatus(value)) {
    case 'pending':
      return 'Awaiting your response';
    case 'confirmed':
      return 'Confirmed';
    case 'in_progress':
    case 'ongoing':
      return 'In progress';
    case 'completed':
      return 'Completed';
    case 'cancelled':
    case 'canceled':
      return 'Cancelled';
    default:
      return value || 'Unknown';
  }
}

function statusClasses(value: string | null | undefined) {
  switch (normalizeStatus(value)) {
    case 'confirmed':
    case 'completed':
      return 'bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-400';
    case 'cancelled':
    case 'canceled':
      return 'bg-error-50 text-error-700 dark:bg-error-900/20 dark:text-error-400';
    case 'pending':
      return 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400';
    default:
      return 'bg-brand-50 text-brand-700 dark:bg-brand-800/50 dark:text-brand-300';
  }
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

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '—';

  return date.toLocaleString('en-KE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatVehicle(value: string | null | undefined) {
  if (!value) return 'Moving vehicle';

  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object') {
    const candidate = error as {
      message?: unknown;
      details?: unknown;
      hint?: unknown;
    };

    if (
      typeof candidate.message === 'string' &&
      candidate.message.trim()
    ) {
      return candidate.message;
    }

    if (
      typeof candidate.details === 'string' &&
      candidate.details.trim()
    ) {
      return candidate.details;
    }

    if (
      typeof candidate.hint === 'string' &&
      candidate.hint.trim()
    ) {
      return candidate.hint;
    }
  }

  return fallback;
}

/* ============================================================
 * COMPONENT
 * ============================================================ */

export default function MoverBookingDetailPage() {
  const {
    selectedMoverBookingId,
    navigate,
  } = useNav();

  const bookingId = selectedMoverBookingId;

  const [data, setData] =
    useState<MoverBookingDetailResponse | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [actionLoading, setActionLoading] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [actionError, setActionError] =
    useState<string | null>(null);

  const [decision, setDecision] =
    useState<Decision | null>(null);

  const [reason, setReason] =
    useState('');

  const [now, setNow] =
    useState(() => Date.now());

  /* ==========================================================
   * LOAD BOOKING
   * ========================================================== */

  const loadBooking = useCallback(
    async (silent = false) => {
      if (!bookingId) {
        setLoading(false);
        setError('No moving booking was selected.');
        return;
      }

      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError(null);

      try {
        const {
          data: result,
          error: rpcError,
        } = await supabase.rpc(
          'get_mover_booking_detail',
          {
            p_booking_id: bookingId,
          }
        );

        if (rpcError) {
          throw rpcError;
        }

        if (!result) {
          throw new Error(
            'Booking details were not returned.'
          );
        }

        setData(
          result as MoverBookingDetailResponse
        );
      } catch (err) {
        console.error(
          'Failed to load mover booking:',
          err
        );

        setError(
          getErrorMessage(
            err,
            'Unable to load this moving booking.'
          )
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [bookingId]
  );

  useEffect(() => {
    void loadBooking();
  }, [loadBooking]);

  /* ==========================================================
   * RESPONSE COUNTDOWN
   * ========================================================== */

  useEffect(() => {
    if (
      !data?.response_deadline ||
      !data.can_respond
    ) {
      return;
    }

    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [
    data?.response_deadline,
    data?.can_respond,
  ]);

  const deadline = data?.response_deadline
    ? new Date(
        data.response_deadline
      ).getTime()
    : null;

  const remainingSeconds = useMemo(() => {
    if (deadline === null) return null;

    return Math.max(
      0,
      Math.floor((deadline - now) / 1000)
    );
  }, [deadline, now]);

  const responseExpired =
    normalizeStatus(data?.booking.status) ===
      'pending' &&
    remainingSeconds !== null &&
    remainingSeconds <= 0;

  const responseAvailable =
    normalizeStatus(data?.booking.status) ===
      'pending' &&
    data?.can_respond === true &&
    !responseExpired;

  const countdownLabel = useMemo(() => {
    if (remainingSeconds === null) return null;

    const minutes = Math.floor(
      remainingSeconds / 60
    );

    const seconds = remainingSeconds % 60;

    return `${minutes}m ${seconds
      .toString()
      .padStart(2, '0')}s`;
  }, [remainingSeconds]);

  /* ==========================================================
   * RESPONSE ACTION
   * ========================================================== */

  const handleDecision = async () => {
    if (!bookingId || !decision) return;

    if (
      (decision === 'cancel' ||
        decision === 'not_sure') &&
      !reason.trim()
    ) {
      setActionError(
        decision === 'cancel'
          ? 'Please provide a reason for declining this request.'
          : 'Please explain what you need to clarify before continuing.'
      );
      return;
    }

    setActionLoading(true);
    setActionError(null);

    try {
      const {
        error: rpcError,
      } = await supabase.rpc(
        'respond_to_mover_booking',
        {
          p_booking_id: bookingId,
          p_decision: decision,
          p_reason:
            reason.trim() || null,
        }
      );

      if (rpcError) {
        throw rpcError;
      }

      const completedDecision = decision;

      setDecision(null);
      setReason('');

      await loadBooking(true);

      /*
       * Do not redirect to Chat here.
       *
       * The booking workflow uses the booking UUID as its
       * conversation_id, while the legacy chat page currently
       * uses the mover/renter pair as its conversation key.
       * Keeping the mover on this page prevents a successful
       * response from appearing to succeed and then opening
       * the wrong conversation.
       */
      if (completedDecision === 'confirm') {
        setActionError(null);
      }
    } catch (err) {
      console.error(
        'Mover booking response failed:',
        err
      );

      setActionError(
        getErrorMessage(
          err,
          'Unable to update this booking.'
        )
      );
    } finally {
      setActionLoading(false);
    }
  };

  /* ==========================================================
   * LOADING
   * ========================================================== */

  if (loading) {
    return (
      <div className="mx-auto flex min-h-[500px] max-w-7xl items-center justify-center px-4">
        <div className="text-center">
          <RefreshCw className="mx-auto h-8 w-8 animate-spin text-brand-500" />
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
            Loading booking request...
          </p>
        </div>
      </div>
    );
  }

  /* ==========================================================
   * ERROR
   * ========================================================== */

  if (error || !data?.booking) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-error-200 bg-error-50 p-6 dark:border-error-800 dark:bg-error-900/20">
          <div className="flex items-start gap-3">
            <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-error-600" />

            <div>
              <h1 className="font-semibold text-error-800 dark:text-error-300">
                Unable to load booking
              </h1>

              <p className="mt-1 text-sm text-error-700 dark:text-error-400">
                {error ??
                  'This booking could not be found.'}
              </p>

              <button
                type="button"
                onClick={() =>
                  void loadBooking()
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

  const {
    booking,
    renter,
    mover,
    schedule,
  } = data;

  const bookingStatus = normalizeStatus(
    booking.status
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {/* ======================================================
          HEADER
      ====================================================== */}

      <header className="mb-6">
        <button
          type="button"
          onClick={() => navigate('dashboard')}
          className="mb-3 text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
        >
          ← Back to mover dashboard
        </button>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl">
                Moving Booking Request
              </h1>

              <span
                className={cn(
                  'inline-flex rounded-full px-3 py-1 text-xs font-semibold',
                  statusClasses(booking.status)
                )}
              >
                {statusLabel(booking.status)}
              </span>
            </div>

            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Review the route, renter and booking terms before responding.
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              void loadBooking(true)
            }
            disabled={refreshing}
            className="btn-secondary inline-flex items-center justify-center gap-2 text-sm"
          >
            <RefreshCw
              className={cn(
                'h-4 w-4',
                refreshing && 'animate-spin'
              )}
            />
            Refresh
          </button>
        </div>
      </header>

      {/* ======================================================
          RESPONSE WINDOW
      ====================================================== */}

      {responseAvailable && (
        <section className="mb-6">
          <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-5 dark:border-yellow-800 dark:bg-yellow-900/20">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-yellow-700 dark:text-yellow-400" />

                <div>
                  <h2 className="font-semibold text-yellow-900 dark:text-yellow-300">
                    Response window is open
                  </h2>

                  <p className="mt-1 text-sm text-yellow-800 dark:text-yellow-400">
                    Please respond before the request expires.
                  </p>
                </div>
              </div>

              <div className="text-left sm:text-right">
                <p className="text-xs font-medium uppercase tracking-wide text-yellow-700 dark:text-yellow-500">
                  Time remaining
                </p>

                <p className="mt-1 text-xl font-bold tabular-nums text-yellow-900 dark:text-yellow-300">
                  {countdownLabel}
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {responseExpired && (
        <section className="mb-6">
          <div className="rounded-2xl border border-error-200 bg-error-50 p-5 dark:border-error-800 dark:bg-error-900/20">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-error-600" />

              <div>
                <h2 className="font-semibold text-error-800 dark:text-error-300">
                  Response window expired
                </h2>

                <p className="mt-1 text-sm text-error-700 dark:text-error-400">
                  This request is no longer available for acceptance. Refresh to get the current booking status.
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ======================================================
          MAIN CONTENT
      ====================================================== */}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          {/* ROUTE */}
          <section className="card p-6 sm:p-7">
            <div className="mb-6 flex items-center gap-2">
              <MapPin className="h-5 w-5 text-brand-600 dark:text-brand-400" />

              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                Moving Route
              </h2>
            </div>

            <div className="relative">
              <div className="absolute bottom-8 left-[11px] top-8 w-px bg-gray-200 dark:bg-brand-700" />

              <div className="relative flex gap-4">
                <div className="z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-800">
                  <ArrowUp className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" />
                </div>

                <div className="min-w-0 pb-8">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Pickup
                  </p>

                  <p className="mt-1 font-semibold text-gray-900 dark:text-white">
                    {booking.pickup_address}
                  </p>
                </div>
              </div>

              <div className="relative flex gap-4">
                <div className="z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success-100 dark:bg-success-900/30">
                  <ArrowDown className="h-3.5 w-3.5 text-success-600 dark:text-success-400" />
                </div>

                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Drop-off
                  </p>

                  <p className="mt-1 font-semibold text-gray-900 dark:text-white">
                    {booking.dropoff_address}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-gray-50 p-4 dark:bg-brand-800/30">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Moving date
                </p>

                <p className="mt-1 font-semibold text-gray-900 dark:text-white">
                  {formatDate(booking.moving_date)}
                </p>
              </div>

              <div className="rounded-xl bg-gray-50 p-4 dark:bg-brand-800/30">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Distance
                </p>

                <p className="mt-1 font-semibold text-gray-900 dark:text-white">
                  {booking.distance_km !== null
                    ? `${booking.distance_km.toFixed(1)} km`
                    : '—'}
                </p>
              </div>

              <div className="rounded-xl bg-gray-50 p-4 dark:bg-brand-800/30">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Requested
                </p>

                <p className="mt-1 font-semibold text-gray-900 dark:text-white">
                  {formatDateTime(booking.requested_at)}
                </p>
              </div>
            </div>
          </section>

          {/* RENTER */}
          <section className="card p-6 sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                {renter?.profile_photo_url ? (
                  <img
                    src={renter.profile_photo_url}
                    alt={renter.full_name ?? 'Renter'}
                    className="h-14 w-14 shrink-0 rounded-2xl object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-50 dark:bg-brand-800/50">
                    <User className="h-6 w-6 text-brand-600 dark:text-brand-400" />
                  </div>
                )}

                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-brand-600 dark:text-brand-400">
                    Renter
                  </p>

                  <h2 className="mt-1 truncate font-bold text-gray-900 dark:text-white">
                    {renter?.full_name ?? 'Renter'}
                  </h2>

                  {(renter?.city || renter?.county) && (
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      {[renter.city, renter.county]
                        .filter(Boolean)
                        .join(', ')}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {data.contact_released && renter?.phone ? (
              <div className="mt-5 rounded-xl border border-success-200 bg-success-50 p-4 dark:border-success-800 dark:bg-success-900/20">
                <p className="text-xs font-medium uppercase tracking-wide text-success-700 dark:text-success-400">
                  Renter contact released
                </p>

                <p className="mt-1 text-sm font-semibold text-success-800 dark:text-success-300">
                  {renter.phone}
                </p>
              </div>
            ) : (
              <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-brand-800 dark:bg-brand-800/30">
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Renter contact details are protected until the booking workflow releases them.
                </p>
              </div>
            )}
          </section>

          {/* VEHICLE */}
          <section className="card p-6 sm:p-7">
            <div className="mb-5 flex items-center gap-2">
              <Truck className="h-5 w-5 text-brand-600 dark:text-brand-400" />

              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                Your Assigned Vehicle
              </h2>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-gray-50 p-4 dark:bg-brand-800/30">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Vehicle
                </p>

                <p className="mt-1 font-semibold text-gray-900 dark:text-white">
                  {formatVehicle(mover?.vehicle_type)}
                </p>
              </div>

              <div className="rounded-xl bg-gray-50 p-4 dark:bg-brand-800/30">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Number plate
                </p>

                <p className="mt-1 font-semibold text-gray-900 dark:text-white">
                  {mover?.number_plate ?? '—'}
                </p>
              </div>

              <div className="rounded-xl bg-gray-50 p-4 dark:bg-brand-800/30">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Operating area
                </p>

                <p className="mt-1 font-semibold text-gray-900 dark:text-white">
                  {[
                    mover?.operating_city,
                    mover?.operating_county,
                  ]
                    .filter(Boolean)
                    .join(', ') || '—'}
                </p>
              </div>
            </div>
          </section>

          {/* SCHEDULE */}
          {schedule && (
            <section className="card p-6 sm:p-7">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-brand-600 dark:text-brand-400" />

                <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                  Proposed Schedule
                </h2>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-gray-50 p-4 dark:bg-brand-800/30">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Start
                  </p>

                  <p className="mt-1 font-semibold text-gray-900 dark:text-white">
                    {formatDateTime(schedule.starts_at)}
                  </p>
                </div>

                <div className="rounded-xl bg-gray-50 p-4 dark:bg-brand-800/30">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    End
                  </p>

                  <p className="mt-1 font-semibold text-gray-900 dark:text-white">
                    {formatDateTime(schedule.ends_at)}
                  </p>
                </div>

                <div className="rounded-xl bg-gray-50 p-4 dark:bg-brand-800/30">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Schedule status
                  </p>

                  <p className="mt-1 font-semibold capitalize text-gray-900 dark:text-white">
                    {schedule.status.toLowerCase()}
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* BOOKING TIMELINE */}
          <section className="card p-6 sm:p-7">
            <div className="mb-5 flex items-center gap-2">
              <Clock3 className="h-5 w-5 text-brand-600 dark:text-brand-400" />

              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                Booking Timeline
              </h2>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Requested
                </p>
                <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                  {formatDateTime(booking.requested_at)}
                </p>
              </div>

              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Confirmed
                </p>
                <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                  {formatDateTime(booking.confirmed_at)}
                </p>
              </div>

              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Scheduled start
                </p>
                <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                  {formatDateTime(booking.scheduled_start_at)}
                </p>
              </div>

              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Scheduled end
                </p>
                <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                  {formatDateTime(booking.scheduled_end_at)}
                </p>
              </div>

              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Started
                </p>
                <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                  {formatDateTime(booking.started_at)}
                </p>
              </div>

              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Completed
                </p>
                <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                  {formatDateTime(booking.completed_at)}
                </p>
              </div>
            </div>
          </section>

          {/* CANCELLATION */}
          {(bookingStatus === 'cancelled' ||
            booking.cancelled_at) && (
            <section className="rounded-2xl border border-error-200 bg-error-50 p-6 dark:border-error-800 dark:bg-error-900/20">
              <div className="flex items-start gap-3">
                <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-error-600 dark:text-error-400" />

                <div>
                  <h2 className="font-bold text-error-800 dark:text-error-300">
                    Booking cancelled
                  </h2>

                  <p className="mt-1 text-sm text-error-700 dark:text-error-400">
                    {booking.cancellation_details ||
                      booking.cancellation_reason ||
                      'This booking has been cancelled.'}
                  </p>

                  {booking.cancelled_at && (
                    <p className="mt-2 text-xs text-error-600 dark:text-error-500">
                      Cancelled {formatDateTime(booking.cancelled_at)}
                    </p>
                  )}
                </div>
              </div>
            </section>
          )}
        </div>

        {/* ====================================================
            SIDEBAR
        ==================================================== */}

        <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          {/* FINANCIAL SUMMARY */}
          <section className="card p-6">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Booking value
            </p>

            <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
              {formatKES(booking.total_amount)}
            </p>

            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Total charged to the renter
            </p>

            <div className="mt-5 space-y-3 border-t border-gray-200 pt-5 dark:border-brand-800">
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="text-gray-500 dark:text-gray-400">
                  Service amount
                </span>

                <span className="font-medium text-gray-900 dark:text-white">
                  {formatKES(booking.booking_amount)}
                </span>
              </div>

              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="text-gray-500 dark:text-gray-400">
                  Platform commission
                </span>

                <span className="font-medium text-gray-900 dark:text-white">
                  {formatKES(booking.commission_amount)}
                </span>
              </div>

              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="text-gray-500 dark:text-gray-400">
                  Payment status
                </span>

                <span className="font-medium capitalize text-gray-900 dark:text-white">
                  {booking.payment_status || '—'}
                </span>
              </div>

              {booking.payment_method && (
                <div className="flex items-center justify-between gap-4 text-sm">
                  <span className="text-gray-500 dark:text-gray-400">
                    Payment method
                  </span>

                  <span className="font-medium capitalize text-gray-900 dark:text-white">
                    {booking.payment_method.replace(/_/g, ' ')}
                  </span>
                </div>
              )}
            </div>
          </section>

          {/* RESPONSE ACTIONS */}
          {responseAvailable && (
            <section className="card p-6">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                Respond to request
              </h2>

              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Accept only if the route, date and booking terms work for you.
              </p>

              {actionError && (
                <div className="mt-4 rounded-xl border border-error-200 bg-error-50 p-3 text-sm text-error-700 dark:border-error-800 dark:bg-error-900/20 dark:text-error-400">
                  {actionError}
                </div>
              )}

              <div className="mt-5 space-y-3">
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => {
                    setActionError(null);
                    setReason('');
                    setDecision('confirm');
                  }}
                  className="btn-primary flex w-full items-center justify-center gap-2"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Accept booking
                </button>

                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => {
                    setActionError(null);
                    setReason('');
                    setDecision('not_sure');
                  }}
                  className="btn-secondary flex w-full items-center justify-center gap-2"
                >
                  Discuss before accepting
                </button>

                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => {
                    setActionError(null);
                    setReason('');
                    setDecision('cancel');
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-error-200 px-4 py-2.5 text-sm font-semibold text-error-700 hover:bg-error-50 dark:border-error-800 dark:text-error-400 dark:hover:bg-error-900/20"
                >
                  <XCircle className="h-4 w-4" />
                  Decline request
                </button>
              </div>
            </section>
          )}

          {/* ACCEPTED STATE */}
          {bookingStatus === 'confirmed' && (
            <section className="card p-6">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success-600 dark:text-success-400" />

                <div>
                  <h2 className="font-bold text-gray-900 dark:text-white">
                    Booking accepted
                  </h2>

                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    The renter has been notified that you accepted the moving request.
                  </p>

                  {booking.confirmed_at && (
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      Accepted {formatDateTime(booking.confirmed_at)}
                    </p>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* CONTACT / SAFETY */}
          <section className="card p-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-brand-600 dark:text-brand-400" />

              <div>
                <h2 className="font-bold text-gray-900 dark:text-white">
                  Booking protection
                </h2>

                <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
                  Keep booking communication inside Saka Krib. Contact information is released by the booking workflow when the appropriate stage is reached.
                </p>
              </div>
            </div>
          </section>
        </aside>
      </div>

      {/* ======================================================
          DECISION MODAL
      ====================================================== */}

      {decision && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="mover-booking-decision-title"
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-brand-950"
          >
            <div className="flex items-start gap-3">
              {decision === 'confirm' ? (
                <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-success-600 dark:text-success-400" />
              ) : decision === 'not_sure' ? (
                <AlertCircle className="mt-0.5 h-6 w-6 shrink-0 text-brand-600 dark:text-brand-400" />
              ) : (
                <XCircle className="mt-0.5 h-6 w-6 shrink-0 text-error-600 dark:text-error-400" />
              )}

              <div className="min-w-0 flex-1">
                <h2
                  id="mover-booking-decision-title"
                  className="text-lg font-bold text-gray-900 dark:text-white"
                >
                  {decision === 'confirm'
                    ? 'Accept this booking?'
                    : decision === 'not_sure'
                      ? 'What would you like to discuss?'
                      : 'Decline this booking?'}
                </h2>

                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {decision === 'confirm'
                    ? 'The renter will be notified that you accepted the request.'
                    : decision === 'not_sure'
                      ? 'Your note will be recorded with the booking so the renter can understand what needs clarification.'
                      : 'A reason is required and will be shared with the renter.'}
                </p>
              </div>
            </div>

            {decision !== 'confirm' && (
              <textarea
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value);
                  if (actionError) {
                    setActionError(null);
                  }
                }}
                rows={4}
                maxLength={1000}
                autoFocus
                placeholder={
                  decision === 'cancel'
                    ? 'Tell the renter why you cannot take this job.'
                    : 'What do you need to clarify about the route, timing or request?'
                }
                className="mt-5 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-brand-700 dark:bg-brand-900 dark:text-white"
              />
            )}

            {actionError && (
              <p className="mt-3 text-sm text-error-600 dark:text-error-400">
                {actionError}
              </p>
            )}

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => {
                  setDecision(null);
                  setReason('');
                  setActionError(null);
                }}
                className="btn-secondary"
              >
                Keep reviewing
              </button>

              <button
                type="button"
                disabled={actionLoading}
                onClick={() => void handleDecision()}
                className={cn(
                  'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white',
                  decision === 'cancel'
                    ? 'bg-error-600 hover:bg-error-700'
                    : 'bg-brand-600 hover:bg-brand-700'
                )}
              >
                {actionLoading && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}

                {actionLoading
                  ? 'Updating...'
                  : decision === 'confirm'
                    ? 'Accept booking'
                    : decision === 'not_sure'
                      ? 'Send response'
                      : 'Decline booking'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
