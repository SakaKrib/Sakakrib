import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  FileText,
  Loader2,
  Plus,
  XCircle,
} from 'lucide-react';

import {
  createRentInvoice,
  getMyRentInvoices,
  previewPaymentDestination,
  type PaymentDestination,
  type RentInvoice,
} from '@/lib/LandlordTs/LandlordpmsInvoices';

import {
  getMyLandlordPaymentMethods,
  type LandlordPaymentMethod,
} from '@/lib/LandlordTs/Landlordpaymentmethods';

import type { PMSUnit } from '@/lib/LandlordTs/Landlordpmsrent';


function formatKES(value: number) {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return 'Not set';
  return new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium' }).format(
    new Date(value)
  );
}

function invoiceStatusBadge(status: RentInvoice['status']) {
  switch (status) {
    case 'PAID':
      return {
        label: 'Paid',
        className:
          'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400',
      };
    case 'PAYMENT_SUBMITTED':
      return {
        label: 'Awaiting confirmation',
        className:
          'bg-brand-100 text-brand-700 dark:bg-brand-800 dark:text-brand-300',
      };
    case 'REJECTED':
      return {
        label: 'Rejected',
        className:
          'bg-error-100 text-error-700 dark:bg-error-900/30 dark:text-error-400',
      };
    case 'CANCELLED':
      return {
        label: 'Cancelled',
        className:
          'bg-gray-100 text-gray-600 dark:bg-brand-800 dark:text-gray-300',
      };
    default:
      return {
        label: 'Due',
        className:
          'bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400',
      };
  }
}

function paymentDestinationLabel(dest: PaymentDestination) {
  if (dest.provider === 'PAYPAL') {
    return `PayPal \u2014 ${dest.paypal_email}`;
  }
  if (dest.mpesa_method === 'PAYBILL') {
    return `M-Pesa PayBill \u2014 ${dest.paybill_number} (${dest.paybill_account})`;
  }
  return `M-Pesa Till \u2014 ${dest.till_number}`;
}


// ============================================================
// CREATE INVOICE
// ============================================================

function CreateInvoiceView({
  units,
  onCreated,
  onCancel,
}: {
  units: PMSUnit[];
  onCreated: () => void;
  onCancel: () => void;
}) {
  const occupiedUnits = useMemo(
    () => units.filter((u) => u.assoc_status === 'ACTIVE'),
    [units]
  );

  const [unitId, setUnitId] = useState(occupiedUnits[0]?.unit_id ?? '');
  const [startYear, setStartYear] = useState(new Date().getFullYear());
  const [startMonth, setStartMonth] = useState(new Date().getMonth() + 1);
  const [monthCount, setMonthCount] = useState(1);
  const [dueDate, setDueDate] = useState('');

  const [methods, setMethods] = useState<LandlordPaymentMethod[]>([]);
  const [methodsLoading, setMethodsLoading] = useState(true);
  const [paymentMethodId, setPaymentMethodId] = useState('');

  const [destinationPreview, setDestinationPreview] =
    useState<PaymentDestination | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    invoice_number: string;
    amount_kes: number;
  } | null>(null);

  const selectedUnit = occupiedUnits.find((u) => u.unit_id === unitId);

  useEffect(() => {
    getMyLandlordPaymentMethods()
      .then((rows) => {
        setMethods(rows);
        const defaultMethod = rows.find((m) => m.is_default) ?? rows[0];
        if (defaultMethod) setPaymentMethodId(defaultMethod.id);
      })
      .catch((err) =>
        setError(
          err instanceof Error ? err.message : 'Unable to load payment methods.'
        )
      )
      .finally(() => setMethodsLoading(false));
  }, []);

  useEffect(() => {
    if (!paymentMethodId || !unitId) {
      setDestinationPreview(null);
      return;
    }

    let cancelled = false;
    setPreviewLoading(true);

    previewPaymentDestination(paymentMethodId, unitId)
      .then((dest) => {
        if (!cancelled) setDestinationPreview(dest);
      })
      .catch(() => {
        if (!cancelled) setDestinationPreview(null);
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [paymentMethodId, unitId]);

  const periods = useMemo(() => {
    const list: { period_year: number; period_month: number }[] = [];
    let y = startYear;
    let m = startMonth;

    for (let i = 0; i < monthCount; i++) {
      list.push({ period_year: y, period_month: m });
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }

    return list;
  }, [startYear, startMonth, monthCount]);

  const estimatedTotal = selectedUnit
    ? selectedUnit.rent * monthCount
    : 0;

  const handleSubmit = async () => {
    if (!unitId || !dueDate || !paymentMethodId) {
      setError('Please complete all fields.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const invoiceResult = await createRentInvoice(
        unitId,
        periods,
        dueDate,
        paymentMethodId
      );

      setResult({
          invoice_number: invoiceResult.invoice_number,
          amount_kes: Number(invoiceResult.amount_kes),
        });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to create invoice.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <div className="rounded-xl border border-success-200 bg-success-50 p-8 text-center dark:border-success-900 dark:bg-success-900/20">
        <CheckCircle2 className="mx-auto h-10 w-10 text-success-600" />
        <h3 className="mt-4 text-lg font-bold text-gray-900 dark:text-white">
          Invoice {result.invoice_number} created
        </h3>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          {formatKES(result.amount_kes)} — the renter has been notified.
        </p>
        <button type="button" onClick={onCreated} className="btn-primary mt-6">
          View Invoices
        </button>
      </div>
    );
  }

  if (occupiedUnits.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center dark:border-brand-700 dark:bg-brand-900">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No units with an active renter — an invoice requires an
          occupied unit with an active renter association.
        </p>
        <button type="button" onClick={onCancel} className="btn-secondary mt-4">
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5 rounded-xl border border-gray-200 bg-white p-5 dark:border-brand-700 dark:bg-brand-900">
      <h3 className="font-semibold text-gray-900 dark:text-white">
        Create Invoice
      </h3>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Unit
        </label>
        <select
          value={unitId}
          onChange={(e) => setUnitId(e.target.value)}
          className="input-field"
        >
          {occupiedUnits.map((u) => (
            <option key={u.unit_id} value={u.unit_id}>
              {`${u.listing_title} \u00b7 Unit ${u.unit_number} \u2014 ${u.renter_name}`}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Starting period
          </label>
          <input
            type="month"
            value={`${startYear}-${String(startMonth).padStart(2, '0')}`}
            onChange={(e) => {
              const [y, m] = e.target.value.split('-').map(Number);
              setStartYear(y);
              setStartMonth(m);
            }}
            className="input-field"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Number of months
          </label>
          <input
            type="number"
            min={1}
            max={24}
            value={monthCount}
            onChange={(e) =>
              setMonthCount(
                Math.min(24, Math.max(1, Number(e.target.value) || 1))
              )
            }
            className="input-field"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Due date
          </label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="input-field"
          />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Payment destination
        </label>
        {methodsLoading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading...
          </div>
        ) : methods.length === 0 ? (
          <p className="text-sm text-warning-600">
            No payment destinations configured — add one in PMS Settings first.
          </p>
        ) : (
          <select
            value={paymentMethodId}
            onChange={(e) => setPaymentMethodId(e.target.value)}
            className="input-field"
          >
            {methods.map((m) => (
              <option key={m.id} value={m.id}>
                {m.display_name || m.provider}
                {m.is_default ? ' (default)' : ''}
              </option>
            ))}
          </select>
        )}

        {previewLoading && (
          <p className="mt-2 text-xs text-gray-400">Verifying...</p>
        )}
        {destinationPreview && (
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            {paymentDestinationLabel(destinationPreview)}
          </p>
        )}
      </div>

      {selectedUnit && (
        <div className="rounded-lg bg-gray-50 p-4 dark:bg-brand-800/30">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">
              {monthCount} month{monthCount === 1 ? '' : 's'} &times;{' '}
              {formatKES(selectedUnit.rent)}
            </span>
            <span className="font-semibold text-gray-900 dark:text-white">
              {formatKES(estimatedTotal)}
            </span>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-error-200 bg-error-50 p-3 text-sm text-error-700 dark:border-error-900 dark:bg-error-900/20 dark:text-error-400">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button type="button" onClick={onCancel} className="btn-secondary flex-1">
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || methods.length === 0}
          className="btn-primary flex-1 inline-flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          Create Invoice
        </button>
      </div>
    </div>
  );
}


// ============================================================
// INVOICES LIST
// ============================================================

export default function LandlordPMSInvoices({
  units,
}: {
  units: PMSUnit[];
}) {
  const [view, setView] = useState<'list' | 'create'>('list');
  const [invoices, setInvoices] = useState<RentInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      const rows = await getMyRentInvoices();
      setInvoices(rows);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to load invoices.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (view === 'create') {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setView('list')}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Invoices
        </button>

        <CreateInvoiceView
          units={units}
          onCreated={() => {
            setView('list');
            load();
          }}
          onCancel={() => setView('list')}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Invoices
        </h2>
        <button
          type="button"
          onClick={() => setView('create')}
          className="btn-primary inline-flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          New Invoice
        </button>
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
      ) : invoices.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center dark:border-brand-700 dark:bg-brand-900">
          <FileText className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600" />
          <p className="mt-3 font-medium text-gray-700 dark:text-gray-300">
            No invoices yet
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white dark:border-brand-700 dark:bg-brand-900">
          <div className="divide-y divide-gray-100 dark:divide-brand-800">
            {invoices.map((invoice) => {
              const badge = invoiceStatusBadge(invoice.status);
              return (
                <div key={invoice.id} className="flex items-center justify-between p-5">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {invoice.invoice_number}
                    </p>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      {unitLabel(invoice.unit_id)} &middot; Due{' '}
                      {formatDate(invoice.due_date)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-gray-900 dark:text-white">
                      {formatKES(invoice.amount_kes)}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}