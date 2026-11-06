import { Banknote, CalendarClock, Home, Tag } from 'lucide-react';
import Select from '@/components/ui/Select';
import CountInput from '@/components/ui/CountInput';
import { cn } from '@/lib/utils';

export type UnitListingType = 'rent' | 'sale';
export type InstallmentFrequency = 'monthly' | 'quarterly' | 'yearly';

/** Sale-side values, kept as strings so inputs can be empty while typing. */
export interface UnitSaleValues {
  salePrice: string;
  installmentDeposit: string;
  installmentAmount: string;
  installmentFrequency: InstallmentFrequency;
  installmentPeriods: string;
}

export const EMPTY_SALE_VALUES: UnitSaleValues = { salePrice: '', installmentDeposit: '', installmentAmount: '', installmentFrequency: 'monthly', installmentPeriods: '' };

const FREQUENCY_LABEL: Record<InstallmentFrequency, string> = { monthly: 'per month', quarterly: 'per quarter', yearly: 'per year' };

export function ListingTypeToggle({ value, onChange }: { value: UnitListingType; onChange: (next: UnitListingType) => void }) {
  const options: Array<{ value: UnitListingType; label: string; icon: typeof Home }> = [
    { value: 'rent', label: 'For rent', icon: Home },
    { value: 'sale', label: 'For sale', icon: Tag },
  ];
  return (
    <div role="radiogroup" aria-label="Unit listing type" className="inline-flex w-full rounded-full border border-gray-200 bg-gray-50 p-1 dark:border-brand-700 dark:bg-brand-950 sm:w-auto">
      {options.map(({ value: option, label, icon: Icon }) => (
        <button key={option} type="button" role="radio" aria-checked={value === option} onClick={() => onChange(option)}
          className={cn('flex flex-1 items-center justify-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold transition-colors sm:flex-none',
            value === option ? 'bg-brand-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white')}>
          <Icon className="h-3.5 w-3.5" />{label}
        </button>
      ))}
    </div>
  );
}

const kes = (n: number) => `KES ${Math.round(n).toLocaleString('en-KE')}`;

/** Buy-at-once price plus an optional installment plan. Either, or both, may be filled in. */
export function SaleFields({ values, onChange }: { values: UnitSaleValues; onChange: (patch: Partial<UnitSaleValues>) => void }) {
  const amount = Number(values.installmentAmount) || 0;
  const periods = Number(values.installmentPeriods) || 0;
  const deposit = Number(values.installmentDeposit) || 0;
  const total = amount > 0 && periods > 0 ? deposit + amount * periods : 0;
  const field = 'mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300';
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 p-4 dark:border-brand-700">
        <p className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white"><Banknote className="h-4 w-4 text-brand-600" />Buy at once</p>
        <label className={cn(field, 'mt-3')}>Sale price (KES)</label>
        <input type="number" inputMode="numeric" min={0} value={values.salePrice} onChange={(e) => onChange({ salePrice: e.target.value })} placeholder="e.g. 6500000" className="input-field" />
        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">The full price if the buyer pays in one go. Leave empty to sell by installments only.</p>
      </div>
      <div className="rounded-2xl border border-gray-200 p-4 dark:border-brand-700">
        <p className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white"><CalendarClock className="h-4 w-4 text-brand-600" />Installment plan <span className="text-xs font-normal text-gray-400">(optional)</span></p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div><label className={field}>Initial deposit (KES)</label><input type="number" inputMode="numeric" min={0} value={values.installmentDeposit} onChange={(e) => onChange({ installmentDeposit: e.target.value })} placeholder="e.g. 650000" className="input-field" /></div>
          <div><label className={field}>Installment amount (KES)</label><input type="number" inputMode="numeric" min={0} value={values.installmentAmount} onChange={(e) => onChange({ installmentAmount: e.target.value })} placeholder="e.g. 85000" className="input-field" /></div>
          <div><label className={field}>Paid</label>
            <Select value={values.installmentFrequency} onChange={(e) => onChange({ installmentFrequency: e.target.value as InstallmentFrequency })} aria-label="Installment frequency">
              <option value="monthly">Every month</option><option value="quarterly">Every quarter</option><option value="yearly">Every year</option>
            </Select></div>
          <div><label className={field}>Number of installments</label><CountInput value={Number(values.installmentPeriods) || 0} onChange={(n) => onChange({ installmentPeriods: String(n) })} min={0} max={360} presets={[6, 12, 24, 36, 60]} unit="installments" aria-label="Number of installments" /></div>
        </div>
        {total > 0 && (
          <p className="mt-3 rounded-xl bg-brand-50 px-3 py-2 text-xs text-brand-800 dark:bg-brand-800/40 dark:text-brand-100">
            {deposit > 0 ? `${kes(deposit)} deposit + ` : ''}{periods} × {kes(amount)} {FREQUENCY_LABEL[values.installmentFrequency]} = <strong>{kes(total)}</strong> total
          </p>
        )}
      </div>
    </div>
  );
}
