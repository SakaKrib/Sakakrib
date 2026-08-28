import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  AlertCircle,
  Receipt,
} from 'lucide-react';

import { formatKES, cn } from '@/lib/utils';

export interface RenterInvoiceSummary {
  id: string;
  invoice_number: string;
  amount_kes: number;
  status: string;
  due_date: string;
  billing_period_start: string;
  billing_period_end: string;
}

interface RenterRentCardProps {
  invoice: RenterInvoiceSummary | null;
  onViewInvoices?: () => void;
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('en-KE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function getStatus(status: string | null | undefined) {
  const normalized = status?.toUpperCase();

  if (normalized === 'PAID') {
    return {
      label: 'Paid',
      icon: CheckCircle2,
      className:
        'bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-400',
    };
  }

  if (normalized === 'OVERDUE') {
    return {
      label: 'Overdue',
      icon: AlertCircle,
      className:
        'bg-error-50 text-error-700 dark:bg-error-900/20 dark:text-error-400',
    };
  }

  if (normalized === 'PAYMENT_SUBMITTED') {
    return {
      label: 'Payment submitted',
      icon: Clock3,
      className:
        'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400',
    };
  }

  return {
    label: status
      ? status.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
      : 'Due',
    icon: Clock3,
    className:
      'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400',
  };
}

export default function RenterRentCard({
  invoice,
  onViewInvoices,
}: RenterRentCardProps) {
  if (!invoice) {
    return (
      <section className="card p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white">
              Rent
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Your latest rent invoice
            </p>
          </div>
          <Receipt className="h-5 w-5 text-brand-600 dark:text-brand-400" />
        </div>

        <div className="py-8 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-success-500" />
          <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
            No outstanding rent
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            You do not currently have an unpaid rent invoice.
          </p>
        </div>

        {onViewInvoices && (
          <button
            type="button"
            onClick={onViewInvoices}
            className="btn-secondary mx-auto flex items-center gap-2 text-sm"
          >
            View invoices
            <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </section>
    );
  }

  const status = getStatus(invoice.status);
  const StatusIcon = status.icon;

  return (
    <section className="card p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-gray-900 dark:text-white">
            Rent
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Your latest rent invoice
          </p>
        </div>
        <Receipt className="h-5 w-5 text-brand-600 dark:text-brand-400" />
      </div>

      <div className="mt-5 rounded-xl border border-gray-200 p-4 dark:border-brand-800">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {invoice.invoice_number || 'Rent invoice'}
            </p>
            <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
              {formatKES(invoice.amount_kes)}
            </p>
          </div>

          <span
            className={cn(
              'inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
              status.className,
            )}
          >
            <StatusIcon className="h-3.5 w-3.5" />
            {status.label}
          </span>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Due date</p>
            <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
              {formatDate(invoice.due_date)}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Billing period</p>
            <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
              {formatDate(invoice.billing_period_start)}
              {' — '}
              {formatDate(invoice.billing_period_end)}
            </p>
          </div>
        </div>

        {onViewInvoices && (
          <button
            type="button"
            onClick={onViewInvoices}
            className="btn-primary mt-5 inline-flex items-center gap-2 text-sm"
          >
            View invoices
            <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </section>
  );
}
