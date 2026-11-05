import { useEffect, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CountInputProps {
  /** Current value. Strings are accepted because most forms keep numbers as text. */
  value: number | string | null | undefined;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  /** Increment. Use 0.5 for bathrooms that may be "2.5"; decimals are only allowed when step is fractional. */
  step?: number;
  /** Quick-pick buttons. Defaults to 0-5. */
  presets?: number[];
  /** Text for specific values, e.g. { 0: 'Studio' }. */
  labels?: Record<number, string>;
  /** Unit shown after the custom number, e.g. "bedrooms". Used for screen readers. */
  unit?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
  'aria-label'?: string;
}

const toNumber = (value: number | string | null | undefined, fallback: number): number => {
  const parsed = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * Count picker: quick-pick chips plus a custom entry (- / + and a typed number).
 * Light and dark theme, rounded, large touch targets. onChange always receives a number
 * clamped to min..max and snapped to `step`.
 */
export default function CountInput({
  value,
  onChange,
  min = 0,
  max = 99,
  step = 1,
  presets,
  labels = {},
  unit = '',
  disabled = false,
  id,
  className,
  'aria-label': ariaLabel,
}: CountInputProps) {
  const decimals = !Number.isInteger(step);
  const chips = presets ?? [0, 1, 2, 3, 4, 5].filter((n) => n >= min && n <= max);
  const current = toNumber(value, min);

  // The typed text is kept separately so "2." or an empty box can be typed without snapping.
  const [text, setText] = useState(String(current));
  useEffect(() => setText(String(toNumber(value, min))), [value, min]);

  const clamp = (n: number) => {
    const snapped = decimals ? Math.round(n / step) * step : Math.round(n);
    const bounded = Math.min(max, Math.max(min, snapped));
    return decimals ? Number(bounded.toFixed(2)) : bounded;
  };

  const commit = (n: number) => {
    const next = clamp(n);
    setText(String(next));
    if (next !== current) onChange(next);
  };

  const label = (n: number) => labels[n] ?? String(n);
  const unitText = unit ? ` ${unit}` : '';

  return (
    <div className={cn('space-y-2', className)} role="group" aria-label={ariaLabel}>
      <div className="flex flex-wrap gap-1.5">
        {chips.map((n) => {
          const selected = current === n;
          return (
            <button
              key={n}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              onClick={() => commit(n)}
              className={cn(
                'min-w-[2.5rem] rounded-full border px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                selected
                  ? 'border-brand-600 bg-brand-600 text-white shadow-sm dark:border-brand-500 dark:bg-brand-500'
                  : 'border-gray-300 bg-white text-gray-700 hover:border-brand-400 hover:text-brand-700 dark:border-brand-700 dark:bg-brand-900 dark:text-gray-200 dark:hover:border-brand-500 dark:hover:text-brand-300',
              )}
            >
              {label(n)}
            </button>
          );
        })}
      </div>

      <div className="inline-flex items-center rounded-xl border border-gray-300 bg-white dark:border-brand-700 dark:bg-brand-900">
        <button
          type="button"
          disabled={disabled || current <= min}
          onClick={() => commit(current - step)}
          aria-label={`Decrease${unitText}`}
          className="flex h-10 w-10 items-center justify-center rounded-l-xl text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-300 dark:hover:bg-brand-800"
        >
          <Minus className="h-4 w-4" />
        </button>
        <input
          id={id}
          type="text"
          inputMode={decimals ? 'decimal' : 'numeric'}
          value={text}
          disabled={disabled}
          aria-label={ariaLabel ? `${ariaLabel} (custom)` : `Custom value${unitText}`}
          onChange={(e) => {
            const pattern = decimals ? /^\d*\.?\d{0,2}$/ : /^\d*$/;
            if (pattern.test(e.target.value)) setText(e.target.value);
          }}
          onBlur={() => commit(text === '' || text === '.' ? min : Number(text))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(text === '' ? min : Number(text)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); commit(current + step); }
            if (e.key === 'ArrowDown') { e.preventDefault(); commit(current - step); }
          }}
          className="h-10 w-14 border-x border-gray-300 bg-transparent text-center text-sm font-semibold text-gray-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:opacity-50 dark:border-brand-700 dark:text-white"
        />
        <button
          type="button"
          disabled={disabled || current >= max}
          onClick={() => commit(current + step)}
          aria-label={`Increase${unitText}`}
          className="flex h-10 w-10 items-center justify-center rounded-r-xl text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-300 dark:hover:bg-brand-800"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
