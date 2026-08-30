import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Clock3, CalendarDays } from 'lucide-react';
import { protectedGet, protectedPatch } from '@/lib/protectedApi';
import { useAuth } from '@/context/AuthContext';
import RegisterMoverPage from './RegisterMoverPage';

const DAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

type Day = (typeof DAYS)[number];

const DEFAULT_DAYS: Day[] = [...DAYS];
const DEFAULT_START = '08:00';
const DEFAULT_END = '18:00';

export default function RegisterMoverScheduleEnhancer() {
  const { profile } = useAuth();
  const [workingDays, setWorkingDays] = useState<Day[]>(DEFAULT_DAYS);
  const [startTime, setStartTime] = useState(DEFAULT_START);
  const [endTime, setEndTime] = useState(DEFAULT_END);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [scheduleSaved, setScheduleSaved] = useState(false);

  const toggleDay = (day: Day) => {
    setWorkingDays((current) =>
      current.includes(day)
        ? current.filter((item) => item !== day)
        : [...current, day]
    );
    setScheduleSaved(false);
  };

  useEffect(() => {
    const findTarget = () => {
      const form = document.querySelector('form');
      if (!form) return null;

      let container = form.querySelector<HTMLElement>('[data-mover-schedule]');
      if (!container) {
        container = document.createElement('div');
        container.setAttribute('data-mover-schedule', 'true');
        const submit = form.querySelector('button[type="submit"]');
        if (submit?.parentElement) {
          submit.parentElement.parentElement?.before(container);
        } else {
          form.appendChild(container);
        }
      }
      return container;
    };

    const sync = () => setTarget(findTarget());
    sync();

    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!profile?.id) return;

    let cancelled = false;

    const syncScheduleAfterSubmission = async () => {
      if (profile.mover_application_status !== 'pending') return;
      if (scheduleSaved || workingDays.length === 0) return;

      try {
        const rows = await protectedGet<Array<{ id: string }>>(
          `/rest/v1/movers?select=id&user_id=eq.${encodeURIComponent(profile.id)}&limit=1`
        );
        const moverId = rows?.[0]?.id;
        if (!moverId || cancelled) return;

        await protectedPatch(
          `/rest/v1/movers?id=eq.${encodeURIComponent(moverId)}`,
          {
            working_days: workingDays,
            start_time: startTime,
            end_time: endTime,
            updated_at: new Date().toISOString(),
          }
        );

        if (!cancelled) setScheduleSaved(true);
      } catch (error) {
        console.error('Failed to save mover working schedule:', error);
      }
    };

    void syncScheduleAfterSubmission();
    return () => {
      cancelled = true;
    };
  }, [
    profile?.id,
    profile?.mover_application_status,
    workingDays,
    startTime,
    endTime,
    scheduleSaved,
  ]);

  const schedulePanel = target
    ? createPortal(
        <section className="card mb-6 p-6" data-mover-schedule-panel>
          <h3 className="mb-2 flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
            <CalendarDays className="h-5 w-5 text-brand-600" />
            Working days and hours
          </h3>

          <p className="mb-5 text-sm text-gray-500 dark:text-gray-400">
            Select the days and hours when customers can request your moving service.
          </p>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Working days <span className="text-error-500">*</span>
            </label>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              {DAYS.map((day) => {
                const selected = workingDays.includes(day);
                const shortDay = day.slice(0, 3);

                return (
                  <button
                    key={day}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleDay(day)}
                    className={
                      `flex min-h-11 items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-brand-500/40 ` +
                      (selected
                        ? 'border-brand-600 bg-brand-600 text-white shadow-sm dark:border-brand-500 dark:bg-brand-500'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-brand-300 hover:bg-brand-50 dark:border-brand-700 dark:bg-brand-900/20 dark:text-gray-200 dark:hover:border-brand-500 dark:hover:bg-brand-800/40')
                    }
                  >
                    {selected && <Check className="h-4 w-4" strokeWidth={2.5} />}
                    <span>{shortDay}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <TimeField
              label="Start time"
              value={startTime}
              onChange={setStartTime}
            />
            <TimeField
              label="End time"
              value={endTime}
              onChange={setEndTime}
            />
          </div>

          {workingDays.length === 0 && (
            <p className="mt-3 text-sm text-error-600">
              Select at least one working day.
            </p>
          )}
        </section>,
        target
      )
    : null;

  return (
    <>
      <RegisterMoverPage />
      {schedulePanel}
    </>
  );
}

function TimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
        {label} <span className="text-error-500">*</span>
      </label>
      <div className="relative">
        <Clock3 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-600" />
        <input
          type="time"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="input-field w-full pl-10"
          required
        />
      </div>
    </div>
  );
}
