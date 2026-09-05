import { CalendarDays, CheckCircle2, Clock3, CircleAlert, Wallet } from 'lucide-react';

type AnyRecord = Record<string, any>;

const money = (value: any) =>
  `KES ${Number(value || 0).toLocaleString('en-KE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;

const monthKey = (value: any) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export interface PMSCalendarStatsProps {
  invoices: AnyRecord[];
  units: AnyRecord[];
  subscription?: AnyRecord | null;
  selectedMonth?: Date;
}

export default function PMSCalendarStats({
  invoices,
  units,
  subscription,
  selectedMonth = new Date(),
}: PMSCalendarStatsProps) {
  const selectedKey = monthKey(selectedMonth);
  const monthInvoices = invoices.filter((invoice) => {
    const value = invoice.due_date || invoice.billing_period_start;
    return monthKey(value) === selectedKey;
  });

  const paid = monthInvoices.filter((invoice) => String(invoice.status).toUpperCase() === 'PAID');
  const submitted = monthInvoices.filter((invoice) =>
    ['PAYMENT_SUBMITTED', 'PENDING'].includes(String(invoice.status).toUpperCase()),
  );
  const overdue = monthInvoices.filter((invoice) => {
    const status = String(invoice.status).toUpperCase();
    if (['PAID', 'REJECTED', 'CANCELLED'].includes(status)) return false;
    if (!invoice.due_date) return false;
    const due = new Date(invoice.due_date);
    return !Number.isNaN(due.getTime()) && due.getTime() < Date.now();
  });

  const expected = monthInvoices.reduce((sum, invoice) => sum + Number(invoice.amount_kes || 0), 0);
  const collected = paid.reduce((sum, invoice) => sum + Number(invoice.amount_kes || 0), 0);
  const occupied = units.filter((unit) => unit.renter_assoc_id).length;
  const occupancy = units.length ? Math.round((occupied / units.length) * 100) : 0;

  const subscriptionEnd = subscription?.current_period_end
    ? new Date(subscription.current_period_end)
    : null;
  const subscriptionDays = subscriptionEnd
    ? Math.ceil((subscriptionEnd.getTime() - Date.now()) / 86400000)
    : null;

  const stats = [
    {
      label: 'Rent due',
      value: money(expected),
      detail: `${monthInvoices.length} invoice${monthInvoices.length === 1 ? '' : 's'}`,
      icon: CalendarDays,
    },
    {
      label: 'Collected',
      value: money(collected),
      detail: expected ? `${Math.round((collected / expected) * 100)}% collected` : 'No invoices due',
      icon: CheckCircle2,
    },
    {
      label: 'Payment review',
      value: submitted.length,
      detail: submitted.length === 1 ? 'submission awaiting review' : 'submissions awaiting review',
      icon: Clock3,
    },
    {
      label: 'Overdue',
      value: overdue.length,
      detail: overdue.length === 1 ? 'invoice needs attention' : 'invoices need attention',
      icon: CircleAlert,
    },
    {
      label: 'Occupancy',
      value: `${occupancy}%`,
      detail: `${occupied} of ${units.length} units occupied`,
      icon: Wallet,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {stats.map(({ label, value, detail, icon: Icon }) => (
          <div key={label} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-brand-800 dark:bg-brand-950">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
                <p className="mt-2 text-xl font-bold text-gray-900 dark:text-white">{value}</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{detail}</p>
              </div>
              <Icon className="h-5 w-5 text-brand-600" />
            </div>
          </div>
        ))}
      </div>

      {subscriptionDays !== null && subscriptionDays <= 30 && (
        <div className="rounded-2xl border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-800 dark:border-warning-900/40 dark:bg-warning-900/20 dark:text-warning-200">
          <strong>{subscription?.plan_name || 'PMS subscription'}</strong>{' '}
          {subscriptionDays > 0
            ? `renews in ${subscriptionDays} day${subscriptionDays === 1 ? '' : 's'}.`
            : 'has reached its current period end. Review your subscription status.'}
        </div>
      )}
    </div>
  );
}
