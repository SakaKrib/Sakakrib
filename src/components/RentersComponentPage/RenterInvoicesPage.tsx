import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  Loader2,
  RefreshCw,
} from 'lucide-react';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useNav } from '@/context/NavContext';
import { cn, formatKES } from '@/lib/utils';

import { renterApi } from '@/lib/Renter/renterApi';

/* ============================================================
 * TYPES
 * ============================================================ */

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

/* ============================================================
 * HELPERS
 * ============================================================ */

function formatDate(
  value: string | null | undefined
) {
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

function getInvoiceAmount(
  invoice: RentInvoice
) {
  return (
    invoice.total_amount ??
    invoice.amount ??
    0
  );
}

function normalizeStatus(
  status: string | null | undefined
) {
  return status
    ?.trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_') ?? '';
}

function getStatusLabel(
  status: string | null | undefined
) {
  switch (normalizeStatus(status)) {
    case 'paid':
    case 'completed':
    case 'settled':
      return 'Paid';

    case 'pending':
    case 'pending_payment':
      return 'Pending';

    case 'overdue':
      return 'Overdue';

    case 'cancelled':
    case 'canceled':
      return 'Cancelled';

    case 'failed':
      return 'Failed';

    default:
      return status || 'Unknown';
  }
}

function getStatusClasses(
  status: string | null | undefined
) {
  switch (normalizeStatus(status)) {
    case 'paid':
    case 'completed':
    case 'settled':
      return [
        'bg-success-50',
        'text-success-700',
        'dark:bg-success-900/20',
        'dark:text-success-400',
      ].join(' ');

    case 'overdue':
    case 'failed':
      return [
        'bg-error-50',
        'text-error-700',
        'dark:bg-error-900/20',
        'dark:text-error-400',
      ].join(' ');

    case 'pending':
    case 'pending_payment':
      return [
        'bg-yellow-50',
        'text-yellow-700',
        'dark:bg-yellow-900/20',
        'dark:text-yellow-400',
      ].join(' ');

    case 'cancelled':
    case 'canceled':
      return [
        'bg-gray-100',
        'text-gray-600',
        'dark:bg-brand-800',
        'dark:text-gray-400',
      ].join(' ');

    default:
      return [
        'bg-gray-100',
        'text-gray-700',
        'dark:bg-brand-800',
        'dark:text-gray-300',
      ].join(' ');
  }
}

function isPaidInvoice(
  invoice: RentInvoice
) {
  return [
    'paid',
    'completed',
    'settled',
  ].includes(
    normalizeStatus(invoice.status)
  );
}

function isOverdueInvoice(
  invoice: RentInvoice
) {
  return (
    normalizeStatus(invoice.status) ===
      'overdue' ||
    (!isPaidInvoice(invoice) &&
      Boolean(invoice.due_date) &&
      new Date(invoice.due_date as string) <
        new Date())
  );
}

function isOutstandingInvoice(
  invoice: RentInvoice
) {
  return (
    !isPaidInvoice(invoice) &&
    ![
      'cancelled',
      'canceled',
    ].includes(
      normalizeStatus(invoice.status)
    )
  );
}

/* ============================================================
 * COMPONENT
 * ============================================================ */

export default function RenterInvoicesPage() {
  const { navigate } = useNav();

  const [invoices, setInvoices] =
    useState<RentInvoice[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  /* ==========================================================
   * LOAD INVOICES
   * ========================================================== */

  const loadInvoices = useCallback(
    async () => {
      setLoading(true);
      setError(null);

      try {
        const response =
          await renterApi.getInvoices();

        setInvoices(
          Array.isArray(response)
            ? response
            : []
        );
      } catch (err) {
        console.error(
          'Failed to load renter invoices:',
          err
        );

        setError(
          err instanceof Error
            ? err.message
            : 'Unable to load your invoices.'
        );

        setInvoices([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  /* ==========================================================
   * INITIAL LOAD
   * ========================================================== */

  useEffect(() => {
    void loadInvoices();
  }, [loadInvoices]);

  /* ==========================================================
   * DERIVED DATA
   * ========================================================== */

  const outstandingInvoices =
    useMemo(
      () =>
        invoices.filter(
          isOutstandingInvoice
        ),
      [invoices]
    );

  const paidInvoices =
    useMemo(
      () =>
        invoices.filter(
          isPaidInvoice
        ),
      [invoices]
    );

  const overdueInvoices =
    useMemo(
      () =>
        invoices.filter(
          isOverdueInvoice
        ),
      [invoices]
    );

  const outstandingAmount =
    useMemo(
      () =>
        outstandingInvoices.reduce(
          (total, invoice) =>
            total +
            getInvoiceAmount(invoice),
          0
        ),
      [outstandingInvoices]
    );

  /* ==========================================================
   * LOADING
   * ========================================================== */

  if (loading) {
    return (
      <div className="mx-auto flex min-h-[400px] max-w-7xl items-center justify-center px-4">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-brand-500" />

          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
            Loading your invoices...
          </p>
        </div>
      </div>
    );
  }

  /* ============================================================
   * RENDER
   * ============================================================ */

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">

      {/* ======================================================
          HEADER
      ====================================================== */}

      <header className="mb-6">

        <button
          type="button"
          onClick={() =>
            navigate('pms-dashboard')
          }
          className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-gray-500 transition-colors hover:text-brand-600 dark:text-gray-400 dark:hover:text-brand-400"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </button>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">

          <div>
            <p className="text-sm font-medium text-brand-600 dark:text-brand-400">
              Renter
            </p>

            <h1 className="mt-1 text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl">
              Rent &amp; Invoices
            </h1>

            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              View your rent invoices and payment history.
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              void loadInvoices()
            }
            className="btn-secondary inline-flex items-center justify-center gap-2 text-sm"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>

        </div>
      </header>

      {/* ======================================================
          ERROR
      ====================================================== */}

      {error && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-800 dark:bg-error-900/20 dark:text-error-400">

          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />

          <div className="min-w-0">
            <p className="font-semibold">
              Unable to load invoices
            </p>

            <p className="mt-0.5 break-words">
              {error}
            </p>

            <button
              type="button"
              onClick={() =>
                void loadInvoices()
              }
              className="mt-2 font-semibold underline"
            >
              Try again
            </button>
          </div>

        </div>
      )}

      {/* ======================================================
          SUMMARY
      ====================================================== */}

      <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

        <div className="card p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Total Invoices
            </p>

            <FileText className="h-5 w-5 text-brand-500" />
          </div>

          <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
            {invoices.length}
          </p>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Outstanding
            </p>

            <Clock3 className="h-5 w-5 text-yellow-500" />
          </div>

          <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
            {formatKES(outstandingAmount)}
          </p>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Overdue
            </p>

            <AlertCircle className="h-5 w-5 text-error-500" />
          </div>

          <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
            {overdueInvoices.length}
          </p>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Paid
            </p>

            <CheckCircle2 className="h-5 w-5 text-success-500" />
          </div>

          <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
            {paidInvoices.length}
          </p>
        </div>

      </section>

      {/* ======================================================
          EMPTY STATE
      ====================================================== */}

      {invoices.length === 0 ? (
        <section className="card p-8">
          <div className="mx-auto flex max-w-md flex-col items-center text-center">

            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 dark:bg-brand-800/50">
              <FileText className="h-7 w-7 text-brand-600 dark:text-brand-400" />
            </div>

            <h2 className="mt-4 text-lg font-bold text-gray-900 dark:text-white">
              No invoices yet
            </h2>

            <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
              Your rent invoices will appear here once they are
              generated for your rental.
            </p>

          </div>
        </section>
      ) : (
        /* ====================================================
           INVOICE LIST
        ==================================================== */

        <section className="card overflow-hidden">

          <div className="border-b border-gray-200 px-5 py-4 dark:border-brand-800 sm:px-6">
            <h2 className="font-semibold text-gray-900 dark:text-white">
              Invoice History
            </h2>

            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Your recent and historical rent invoices.
            </p>
          </div>

          <div className="divide-y divide-gray-200 dark:divide-brand-800">

            {invoices.map((invoice) => {
              const amount =
                getInvoiceAmount(invoice);

              const overdue =
                isOverdueInvoice(invoice);

              return (
                <div
                  key={invoice.id}
                  className="p-5 transition-colors hover:bg-gray-50 dark:hover:bg-brand-800/20 sm:p-6"
                >

                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">

                    {/* Invoice information */}

                    <div className="min-w-0">

                      <div className="flex flex-wrap items-center gap-2">

                        <h3 className="font-semibold text-gray-900 dark:text-white">
                          {invoice.invoice_number ||
                            'Rent Invoice'}
                        </h3>

                        <span
                          className={cn(
                            'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold',
                            getStatusClasses(
                              overdue
                                ? 'overdue'
                                : invoice.status
                            )
                          )}
                        >
                          {getStatusLabel(
                            overdue
                              ? 'overdue'
                              : invoice.status
                          )}
                        </span>

                      </div>

                      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-xs text-gray-500 dark:text-gray-400">

                        <span className="inline-flex items-center gap-1.5">
                          <CalendarDays className="h-3.5 w-3.5" />
                          Due {formatDate(invoice.due_date)}
                        </span>

                        {invoice.billing_period_start &&
                          invoice.billing_period_end && (
                            <span>
                              Period:{' '}
                              {formatDate(
                                invoice.billing_period_start
                              )}{' '}
                              –{' '}
                              {formatDate(
                                invoice.billing_period_end
                              )}
                            </span>
                          )}

                      </div>

                    </div>

                    {/* Amount + action */}

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center lg:justify-end">

                      <div className="lg:text-right">
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Amount
                        </p>

                        <p className="text-lg font-bold text-gray-900 dark:text-white">
                          {formatKES(amount)}
                        </p>
                      </div>

                      {isOutstandingInvoice(invoice) && (
                        <button
                          type="button"
                          onClick={() =>
                            navigate(
                              'renter-payment',
                              invoice.id
                            )
                          }
                          className="btn-primary inline-flex items-center justify-center text-sm"
                        >
                          Pay Rent
                        </button>
                      )}

                    </div>

                  </div>

                </div>
              );
            })}

          </div>

        </section>
      )}

      {/* ======================================================
          FOOTER
      ====================================================== */}

      <footer className="mt-8 pb-4 text-center text-xs text-gray-400">
        © Copyright Saka Krib. All Rights Reserved.
      </footer>

    </div>
  );
};