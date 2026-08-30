import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Clock3,
  Loader2,
  XCircle,
} from 'lucide-react';

import {
  confirmRentPayment,
  getPendingPaymentConfirmations,
  rejectRentPayment,
  type PendingConfirmation,
} from '@/lib/LandlordTs/LandlordpmsInvoices';

import type { PMSUnit } from '@/lib/LandlordTs/Landlordpmsrent';


function formatKES(value: number) {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-KE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatMonthYear(year: number, month: number) {
  return new Intl.DateTimeFormat('en-KE', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month - 1, 1));
}


export default function LandlordPMSPaymentConfirmations({
  units,
}: {
  units: PMSUnit[];
}) {
  const [confirmations, setConfirmations] = useState<PendingConfirmation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const unitLabel = (unitId: string) => {
    const unit = units.find((u) => u.unit_id === unitId);
    return unit
      ? `${unit.listing_title} \u00b7 Unit ${unit.unit_number}`
      : 'Unit';
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await getPendingPaymentConfirmations();
      setConfirmations(rows);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load payment confirmations.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleConfirm = async (submissionId: string) => {
    setProcessingId(submissionId);
    setError(null);
    try {
      await confirmRentPayment(submissionId);
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to confirm payment.'
      );
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (submissionId: string) => {
    if (!rejectReason.trim()) {
      setError('Please provide a reason for rejecting this payment.');
      return;
    }

    setProcessingId(submissionId);
    setError(null);
    try {
      await rejectRentPayment(submissionId, rejectReason.trim());
      setRejectingId(null);
      setRejectReason('');
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to reject payment.'
      );
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Payment Confirmations
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Review externally paid rent submitted by renters. Confirming
          or rejecting is final — the renter is notified either way.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-error-200 bg-error-50 p-4 text-sm text-error-700 dark:border-error-900 dark:bg-error-900/20 dark:text-error-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-gray-500 dark:text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading...
        </div>
      ) : confirmations.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center dark:border-brand-700 dark:bg-brand-900">
          <CheckCircle2 className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600" />
          <p className="mt-3 font-medium text-gray-700 dark:text-gray-300">
            Nothing pending confirmation
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {confirmations.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border border-gray-200 bg-white p-5 dark:border-brand-700 dark:bg-brand-900"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {item.invoice.invoice_number}
                  </p>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {unitLabel(item.unit_id)}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-100 px-3 py-1 text-xs font-medium text-warning-700 dark:bg-warning-900/30 dark:text-warning-400">
                  <Clock3 className="h-3.5 w-3.5" />
                  Pending review
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-4 border-t border-gray-100 pt-4 dark:border-brand-800 sm:grid-cols-4">
                <div>
                  <p className="text-xs text-gray-400">Period</p>
                  <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                    {formatMonthYear(
                      new Date(item.invoice.billing_period_start).getFullYear(),
                      new Date(item.invoice.billing_period_start).getMonth() + 1
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Amount</p>
                  <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                    {formatKES(item.invoice.amount_kes)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Transaction ID</p>
                  <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                    {item.transaction_reference}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Submitted</p>
                  <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                    {formatDateTime(item.submitted_at)}
                  </p>
                </div>
              </div>

              {rejectingId === item.id ? (
                <div className="mt-4 space-y-3 border-t border-gray-100 pt-4 dark:border-brand-800">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Reason for rejection
                  </label>
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    rows={2}
                    className="input-field resize-none"
                    placeholder="e.g. Transaction ID doesn't match any received payment"
                  />
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setRejectingId(null);
                        setRejectReason('');
                      }}
                      className="btn-secondary flex-1"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReject(item.id)}
                      disabled={processingId === item.id}
                      className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-error-600 px-2 py-2.5 text-sm font-semibold text-white hover:bg-error-700 disabled:opacity-50"
                    >
                      {processingId === item.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <XCircle className="h-4 w-4" />
                      )}
                      Confirm Rejection
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 flex gap-3 border-t border-gray-100 pt-4 dark:border-brand-800">
                  <button
                    type="button"
                    onClick={() => setRejectingId(item.id)}
                    disabled={processingId === item.id}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-2 py-2.5 text-sm font-semibold text-error-600 hover:bg-error-50 disabled:opacity-50 dark:border-brand-700 dark:hover:bg-error-900/20"
                  >
                    <XCircle className="h-4 w-4" />
                    Reject Payment
                  </button>
                  <button
                    type="button"
                    onClick={() => handleConfirm(item.id)}
                    disabled={processingId === item.id}
                    className="btn-primary flex-1 inline-flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {processingId === item.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    Confirm Payment
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}