import {
  ArrowRight,
  CalendarDays,
  FileText,
  Loader2,
  MapPin,
  Plus,
  Truck,
  CreditCard,
} from 'lucide-react';

import { useEffect, useState } from 'react';

import { renterApi, type MovingInvoice } from '@/lib/Renter/renterApi';
import { formatKES } from '@/lib/utils';

/* ============================================================
 * TYPES
 * ============================================================ */

export interface RenterMoveBooking {
  id: string;
  pickup_address?: string | null;
  dropoff_address?: string | null;
  moving_date?: string | null;
  booking_amount?: number | null;
  total_amount?: number | null;
  status?: string | null;
  payment_status?: string | null;
}

interface RenterMoveCardProps {
  booking?: RenterMoveBooking | null;
  onTrack?: (bookingId: string) => void;
  onFindMover?: () => void;
}

/* ============================================================
 * HELPERS
 * ============================================================ */

function formatDate(value?: string | null) {
  if (!value) return '—';

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

function getBookingStatus(status?: string | null) {
  const normalized = status?.trim().toLowerCase();

  if (normalized === 'completed' || normalized === 'complete') {
    return {
      label: 'Completed',
      className:
        'bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-400',
    };
  }

  if (normalized === 'cancelled' || normalized === 'canceled') {
    return {
      label: 'Cancelled',
      className:
        'bg-error-50 text-error-700 dark:bg-error-900/20 dark:text-error-400',
    };
  }

  if (
    normalized === 'in_progress' ||
    normalized === 'in-progress' ||
    normalized === 'ongoing'
  ) {
    return {
      label: 'In Progress',
      className:
        'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300',
    };
  }

  if (normalized === 'confirmed' || normalized === 'accepted') {
    return {
      label: 'Confirmed',
      className:
        'bg-btnblue-50 text-btnblue-700 dark:bg-btnblue-900/20 dark:text-btnblue-400',
    };
  }

  return {
    label: status || 'Pending',
    className:
      'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400',
  };
}

function invoiceStatusLabel(status?: string | null) {
  const normalized = status?.trim().toUpperCase();

  switch (normalized) {
    case 'PAID':
      return 'Paid';
    case 'HELD':
      return 'Held in escrow';
    case 'RELEASED':
      return 'Released';
    case 'REFUNDED':
      return 'Refunded';
    case 'CANCELLED':
      return 'Cancelled';
    case 'ISSUED':
      return 'Issued';
    default:
      return status || 'Unavailable';
  }
}

function invoiceStatusClass(status?: string | null) {
  const normalized = status?.trim().toUpperCase();

  if (normalized === 'PAID' || normalized === 'HELD' || normalized === 'RELEASED') {
    return 'bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-400';
  }

  if (normalized === 'REFUNDED' || normalized === 'CANCELLED') {
    return 'bg-gray-100 text-gray-600 dark:bg-brand-800 dark:text-gray-400';
  }

  return 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400';
}

/* ============================================================
 * COMPONENT
 * ============================================================ */

export default function RenterMoveCard({
  booking,
  onTrack,
  onFindMover,
}: RenterMoveCardProps) {
  const status = getBookingStatus(booking?.status);
  const [invoice, setInvoice] = useState<MovingInvoice | null>(null);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const refreshInvoice = async () => {
    if (!booking?.id) {
      setInvoice(null);
      return;
    }

    try {
      const result = await renterApi.getMovingInvoice(booking.id);
      setInvoice(result);
    } catch (error) {
      console.error('Failed to load moving invoice:', error);
      setInvoice(null);
    }
  };

  useEffect(() => {
    let active = true;

    const loadInvoice = async () => {
      if (!booking?.id) {
        setInvoice(null);
        return;
      }

      setInvoiceLoading(true);

      try {
        const result = await renterApi.getMovingInvoice(booking.id);
        if (active) setInvoice(result);
      } catch (error) {
        console.error('Failed to load moving invoice:', error);
        if (active) setInvoice(null);
      } finally {
        if (active) setInvoiceLoading(false);
      }
    };

    void loadInvoice();

    return () => {
      active = false;
    };
  }, [booking?.id]);

  useEffect(() => {
    setPaymentMessage(null);
    setPaymentError(null);
  }, [booking?.id, booking?.status, booking?.payment_status]);

  const handleMpesaPayment = async () => {
    if (!booking?.id) return;
    setPaymentLoading(true);
    setPaymentMessage(null);
    setPaymentError(null);

    try {
      const result = await renterApi.startMovingMpesaPayment(booking.id);
      setPaymentMessage(
        result.customer_message || 'M-Pesa payment prompt sent. Complete the prompt on your phone; payment will be confirmed automatically.',
      );

      const startedAt = Date.now();
      const poll = async () => {
        if (Date.now() - startedAt > 90000) return;
        try {
          const current = await renterApi.getBooking(booking.id);
          if (String(current.payment_status).toLowerCase() === 'paid') {
            await refreshInvoice();
            setPaymentMessage('Payment received and securely held in escrow.');
            return;
          }
        } catch (error) {
          console.error('Failed to check moving payment status:', error);
        }
        window.setTimeout(() => void poll(), 3000);
      };
      window.setTimeout(() => void poll(), 3000);
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : 'Unable to start M-Pesa payment.');
    } finally {
      setPaymentLoading(false);
    }
  };

  const handlePaypalPayment = async () => {
    if (!booking?.id) return;
    setPaymentLoading(true);
    setPaymentMessage(null);
    setPaymentError(null);

    try {
      const result = await renterApi.startMovingPaypalPayment(booking.id);
      if (!result.approval_url) {
        throw new Error('PayPal approval URL was not returned.');
      }
      window.location.assign(result.approval_url);
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : 'Unable to start PayPal payment.');
      setPaymentLoading(false);
    }
  };

  const canPay =
    booking?.status?.trim().toLowerCase() === 'confirmed' &&
    booking?.payment_status?.trim().toLowerCase() !== 'paid' &&
    invoice?.status?.trim().toUpperCase() === 'ISSUED';

  return (
    <section className="card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-brand-800">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-50 dark:bg-accent-900/20">
            <Truck className="h-5 w-5 text-accent-600 dark:text-accent-400" />
          </div>

          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white">
              Moving Activity
            </h2>

            <p className="text-xs text-gray-500 dark:text-gray-400">
              Your current mover activity
            </p>
          </div>
        </div>

        {booking && (
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${status.className}`}
          >
            {status.label}
          </span>
        )}
      </div>

      {/* Empty state */}
      {!booking ? (
        <div className="px-5 py-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gray-50 dark:bg-brand-800/30">
            <Truck className="h-6 w-6 text-gray-400 dark:text-brand-600" />
          </div>

          <h3 className="mt-3 text-sm font-semibold text-gray-900 dark:text-white">
            No active move
          </h3>

          <p className="mx-auto mt-1 max-w-sm text-xs text-gray-500 dark:text-gray-400">
            Book a mover whenever you need relocation assistance.
          </p>

          {onFindMover && (
            <button
              type="button"
              onClick={onFindMover}
              className="btn-secondary mt-4 inline-flex items-center gap-2 text-sm"
            >
              <Plus className="h-4 w-4" />
              Find a Mover
            </button>
          )}
        </div>
      ) : (
        <div className="p-5">
          {/* Moving date */}
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <CalendarDays className="h-4 w-4" />
            <span>{formatDate(booking.moving_date)}</span>
          </div>

          {/* Route */}
          <div className="mt-5 space-y-4">
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                Pickup
              </p>
              <div className="mt-1 flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {booking.pickup_address || 'Pickup address unavailable'}
                </p>
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                Drop-off
              </p>
              <div className="mt-1 flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-success-500" />
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {booking.dropoff_address || 'Drop-off address unavailable'}
                </p>
              </div>
            </div>
          </div>

          {/* Amount */}
          {(booking.total_amount != null || booking.booking_amount != null) && (
            <div className="mt-5 rounded-xl bg-gray-50 p-3 dark:bg-brand-800/30">
              <p className="text-xs text-gray-500 dark:text-gray-400">Move Cost</p>
              <p className="mt-1 text-sm font-bold text-gray-900 dark:text-white">
                {formatKES(booking.total_amount ?? booking.booking_amount)}
              </p>
            </div>
          )}

          {/* Moving invoice */}
          <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-brand-800 dark:bg-brand-900/30">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-800/50">
                  <FileText className="h-5 w-5 text-brand-600 dark:text-brand-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    Moving Invoice
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {invoice
                      ? `Invoice #${invoice.invoice_number}`
                      : booking.payment_status?.toLowerCase() === 'paid'
                        ? 'Invoice is being prepared.'
                        : 'Invoice becomes available after the mover confirms.'}
                  </p>
                </div>
              </div>

              {invoiceLoading && (
                <Loader2 className="h-4 w-4 animate-spin text-brand-500" aria-label="Loading invoice" />
              )}
            </div>

            {invoice ? (
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-gray-50 p-3 dark:bg-brand-800/30">
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">Amount</p>
                  <p className="mt-1 text-sm font-bold text-gray-900 dark:text-white">
                    {formatKES(invoice.amount_kes)}
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3 dark:bg-brand-800/30">
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">Status</p>
                  <span
                    className={`mt-1 inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${invoiceStatusClass(invoice.status)}`}
                  >
                    {invoiceStatusLabel(invoice.status)}
                  </span>
                </div>
              </div>
            ) : !invoiceLoading ? (
              <p className="mt-3 text-xs leading-5 text-gray-500 dark:text-gray-400">
                The moving invoice is created when the mover confirms the request. It is the authoritative amount used for payment.
              </p>
            ) : null}

            {canPay && (
              <div className="mt-4 border-t border-gray-200 pt-4 dark:border-brand-800">
                <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
                  Payment is required after mover confirmation. Funds are held securely until delivery is confirmed.
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => void handleMpesaPayment()}
                    disabled={paymentLoading}
                    className="btn-primary inline-flex items-center justify-center gap-2 text-sm"
                  >
                    {paymentLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                    Pay with M-Pesa
                  </button>
                  <button
                    type="button"
                    onClick={() => void handlePaypalPayment()}
                    disabled={paymentLoading}
                    className="btn-secondary inline-flex items-center justify-center gap-2 text-sm"
                  >
                    {paymentLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                    Pay with PayPal
                  </button>
                </div>
              </div>
            )}

            {paymentMessage && (
              <div className="mt-3 rounded-lg bg-success-50 px-3 py-2 text-xs text-success-700 dark:bg-success-900/20 dark:text-success-400">
                {paymentMessage}
              </div>
            )}
            {paymentError && (
              <div className="mt-3 rounded-lg bg-error-50 px-3 py-2 text-xs text-error-700 dark:bg-error-900/20 dark:text-error-400">
                {paymentError}
              </div>
            )}
          </div>

          {/* Action */}
          {onTrack && (
            <button
              type="button"
              onClick={() => onTrack(booking.id)}
              className="btn-primary mt-5 inline-flex w-full items-center justify-center gap-2 text-sm sm:w-auto"
            >
              Track Mover
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
    </section>
  );
}
