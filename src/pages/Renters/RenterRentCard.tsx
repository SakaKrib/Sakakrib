import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Receipt,
} from 'lucide-react';

import { formatKES, cn } from '@/lib/utils';

/* ============================================================
 * TYPES
 * ============================================================ */

export interface RenterRentInvoice {
  id: string;
  invoice_number?: string | null;
  amount?: number | null;
  total_amount?: number | null;
  status?: string | null;
  due_date?: string | null;
  billing_period_start?: string | null;
  billing_period_end?: string | null;
}

interface RenterRentCardProps {
  invoice?: RenterRentInvoice | null;
  monthlyRent?: number | null;
  onViewInvoices?: () => void;
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

function getStatus(status?: string | null) {
  const normalized = status?.trim().toLowerCase();

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

/* ============================================================
 * COMPONENT
 * ============================================================ */

export default function RenterRentCard({
  invoice,
  monthlyRent,
  onViewInvoices,
}: RenterRentCardProps) {
  const status = getStatus(invoice?.status);
  const StatusIcon = status.icon;

  const amount =
    invoice?.total_amount ??
    invoice?.amount ??
    monthlyRent ??
    null;

  const hasInvoice = Boolean(invoice);

  return (
    <section className="card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-brand-800">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-900/30">
            <Receipt className="h-5 w-5 text-brand-600 dark:text-brand-400" />
          </div>

          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white">
              Rent
            </h2>

            <p className="text-xs text-gray-500 dark:text-gray-400">
              Your latest rent information
            </p>
          </div>
        </div>

        {hasInvoice && (
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
              status.className
            )}
          >
            <StatusIcon className="h-3.5 w-3.5" />
            {status.label}
          </span>
        )}
      </div>

      {/* Content */}
      {!hasInvoice ? (
        <div className="px-5 py-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success-50 dark:bg-success-900/20">
            <CheckCircle2 className="h-6 w-6 text-success-600 dark:text-success-400" />
          </div>

          <h3 className="mt-3 text-sm font-semibold text-gray-900 dark:text-white">
            No outstanding rent
          </h3>

          <p className="mx-auto mt-1 max-w-sm text-xs text-gray-500 dark:text-gray-400">
            There is currently no outstanding rent invoice on your account.
          </p>

          {monthlyRent != null && (
            <div className="mt-5 rounded-xl bg-gray-50 p-4 text-left dark:bg-brand-800/30">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Monthly Rent
              </p>

              <p className="mt-1 text-lg font-bold text-gray-900 dark:text-white">
                {formatKES(monthlyRent)}
              </p>
            </div>
          )}

          {onViewInvoices && (
            <button
              type="button"
              onClick={onViewInvoices}
              className="btn-secondary mt-5 inline-flex items-center gap-2 text-sm"
            >
              View Rent History
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      ) : (
        <div className="p-5">
          {/* Amount */}
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
              Amount Due
            </p>

            <p className="mt-1 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
              {formatKES(amount)}
            </p>

            {invoice.invoice_number && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {invoice.invoice_number}
              </p>
            )}
          </div>

          {/* Details */}
          <div className="mt-5 grid grid-cols-2 gap-4">
            <div className="rounded-xl bg-gray-50 p-3 dark:bg-brand-800/30">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Due Date
              </p>

              <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                {formatDate(invoice.due_date)}
              </p>
            </div>

            <div className="rounded-xl bg-gray-50 p-3 dark:bg-brand-800/30">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Billing Period
              </p>

              <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                {formatDate(invoice.billing_period_start)}
              </p>

              {invoice.billing_period_end && (
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  to {formatDate(invoice.billing_period_end)}
                </p>
              )}
            </div>
          </div>

          {/* Action */}
          {onViewInvoices && (
            <button
              type="button"
              onClick={onViewInvoices}
              className="btn-primary mt-5 inline-flex w-full items-center justify-center gap-2 text-sm sm:w-auto"
            >
              View Invoice
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
    </section>
  );
}
