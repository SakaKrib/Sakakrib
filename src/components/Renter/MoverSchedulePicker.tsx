import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Info,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { cn } from '@/lib/utils';

export interface MoverBlockedInterval {
  id?: string;
  starts_at: string;
  ends_at: string;
  status?: string | null;
}

export interface MoverScheduleValue {
  date: string;
  startTime: string;
  endTime: string;
}

export interface MoverSchedulePickerProps {
  workingDays?: string[] | null;
  startTime?: string | null;
  endTime?: string | null;
  blockedIntervals?: MoverBlockedInterval[];
  value?: Partial<MoverScheduleValue>;
  minDate?: string;
  monthsToShow?: number;
  slotMinutes?: number;
  minDurationMinutes?: number;
  onChange?: (value: MoverScheduleValue) => void;
  disabled?: boolean;
}

const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDateKey(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function minutesFromTime(value: string | null | undefined) {
  if (!value) return null;
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function timeFromMinutes(value: number) {
  const safe = Math.max(0, Math.min(1439, value));
  return `${pad(Math.floor(safe / 60))}:${pad(safe % 60)}`;
}

function formatTime(value: string) {
  const minutes = minutesFromTime(value);
  if (minutes === null) return value;

  const date = new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60);
  return date.toLocaleTimeString('en-KE', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function normalizeDay(value: string) {
  const normalized = value.trim().toLowerCase();

  const aliases: Record<string, string> = {
    sun: 'sunday',
    mon: 'monday',
    tue: 'tuesday',
    tues: 'tuesday',
    wed: 'wednesday',
    thu: 'thursday',
    thur: 'thursday',
    thurs: 'thursday',
    fri: 'friday',
    sat: 'saturday',
  };

  return aliases[normalized] ?? normalized;
}

function getWorkingDayIndexes(workingDays: string[] | null | undefined) {
  if (!workingDays?.length) {
    return new Set([0, 1, 2, 3, 4, 5, 6]);
  }

  const normalized = new Set(workingDays.map(normalizeDay));
  return new Set(
    DAY_NAMES.map((day, index) =>
      normalized.has(day.toLowerCase()) ? index : -1,
    ).filter((index) => index >= 0),
  );
}

function intervalOverlaps(
  date: string,
  startTime: string,
  endTime: string,
  blockedIntervals: MoverBlockedInterval[],
) {
  const startMinutes = minutesFromTime(startTime);
  const endMinutes = minutesFromTime(endTime);
  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
    return true;
  }

  const day = parseDateKey(date);
  const start = new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    Math.floor(startMinutes / 60),
    startMinutes % 60,
  ).getTime();
  const end = new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    Math.floor(endMinutes / 60),
    endMinutes % 60,
  ).getTime();

  return blockedIntervals.some((interval) => {
    if (String(interval.status ?? '').toUpperCase() === 'CANCELLED') return false;

    const blockedStart = new Date(interval.starts_at).getTime();
    const blockedEnd = new Date(interval.ends_at).getTime();
    if (!Number.isFinite(blockedStart) || !Number.isFinite(blockedEnd)) return false;

    return start < blockedEnd && end > blockedStart;
  });
}

function getAvailableStartTimes(
  date: string,
  dayStart: number,
  dayEnd: number,
  slotMinutes: number,
  minDurationMinutes: number,
  blockedIntervals: MoverBlockedInterval[],
) {
  const values: string[] = [];

  for (
    let start = dayStart;
    start + minDurationMinutes <= dayEnd;
    start += slotMinutes
  ) {
    const end = start + minDurationMinutes;
    const startTime = timeFromMinutes(start);
    const endTime = timeFromMinutes(end);

    if (!intervalOverlaps(date, startTime, endTime, blockedIntervals)) {
      values.push(startTime);
    }
  }

  return values;
}

function getAvailableEndTimes(
  date: string,
  startTime: string,
  dayEnd: number,
  slotMinutes: number,
  minDurationMinutes: number,
  blockedIntervals: MoverBlockedInterval[],
) {
  const start = minutesFromTime(startTime);
  if (start === null) return [];

  const values: string[] = [];

  for (
    let end = start + minDurationMinutes;
    end <= dayEnd;
    end += slotMinutes
  ) {
    const endTime = timeFromMinutes(end);
    if (!intervalOverlaps(date, startTime, endTime, blockedIntervals)) {
      values.push(endTime);
    }
  }

  return values;
}

function formatDateLabel(value: string) {
  const date = parseDateKey(value);
  return new Intl.DateTimeFormat('en-KE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function addMonths(value: Date, months: number) {
  return new Date(value.getFullYear(), value.getMonth() + months, 1);
}

export default function MoverSchedulePicker({
  workingDays,
  startTime = '08:00',
  endTime = '18:00',
  blockedIntervals = [],
  value,
  minDate,
  monthsToShow = 3,
  slotMinutes = 30,
  minDurationMinutes = 60,
  onChange,
  disabled = false,
}: MoverSchedulePickerProps) {
  const today = startOfDay(new Date());
  const earliestDate = minDate ? startOfDay(parseDateKey(minDate)) : today;

  const [monthCursor, setMonthCursor] = useState(
    new Date(earliestDate.getFullYear(), earliestDate.getMonth(), 1),
  );
  const [selectedDate, setSelectedDate] = useState(value?.date ?? '');
  const [selectedStart, setSelectedStart] = useState(value?.startTime ?? '');
  const [selectedEnd, setSelectedEnd] = useState(value?.endTime ?? '');

  const dayStart = minutesFromTime(startTime) ?? 480;
  const dayEnd = minutesFromTime(endTime) ?? 1080;
  const workingDayIndexes = useMemo(
    () => getWorkingDayIndexes(workingDays),
    [workingDays],
  );

  const normalizedBlockedIntervals = useMemo(
    () => blockedIntervals.filter((interval) => {
      const status = String(interval.status ?? '').toUpperCase();
      return status !== 'CANCELLED';
    }),
    [blockedIntervals],
  );

  const isDateSelectable = (date: Date) => {
    const dateKey = toDateKey(date);
    if (date < earliestDate) return false;
    if (!workingDayIndexes.has(date.getDay())) return false;

    return getAvailableStartTimes(
      dateKey,
      dayStart,
      dayEnd,
      slotMinutes,
      minDurationMinutes,
      normalizedBlockedIntervals,
    ).length > 0;
  };

  const calendarDays = useMemo(() => {
    const first = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
    const last = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0);
    const leading = first.getDay();
    const total = leading + last.getDate();
    const cellCount = Math.ceil(total / 7) * 7;

    return Array.from({ length: cellCount }, (_, index) => {
      const date = new Date(
        monthCursor.getFullYear(),
        monthCursor.getMonth(),
        index - leading + 1,
      );
      return {
        date,
        inMonth: date.getMonth() === monthCursor.getMonth(),
        key: toDateKey(date),
      };
    });
  }, [monthCursor]);

  const selectableMonthCount = Math.max(1, monthsToShow);
  const lastAllowedMonth = addMonths(
    new Date(earliestDate.getFullYear(), earliestDate.getMonth(), 1),
    selectableMonthCount - 1,
  );

  const canGoPrevious = monthCursor.getTime() > new Date(
    earliestDate.getFullYear(),
    earliestDate.getMonth(),
    1,
  ).getTime();

  const canGoNext = monthCursor.getTime() < lastAllowedMonth.getTime();

  const startOptions = useMemo(() => {
    if (!selectedDate) return [];

    return getAvailableStartTimes(
      selectedDate,
      dayStart,
      dayEnd,
      slotMinutes,
      minDurationMinutes,
      normalizedBlockedIntervals,
    );
  }, [selectedDate, dayStart, dayEnd, slotMinutes, minDurationMinutes, normalizedBlockedIntervals]);

  const endOptions = useMemo(() => {
    if (!selectedDate || !selectedStart) return [];

    return getAvailableEndTimes(
      selectedDate,
      selectedStart,
      dayEnd,
      slotMinutes,
      minDurationMinutes,
      normalizedBlockedIntervals,
    );
  }, [selectedDate, selectedStart, dayEnd, slotMinutes, minDurationMinutes, normalizedBlockedIntervals]);

  useEffect(() => {
    if (!selectedDate || !startOptions.includes(selectedStart)) {
      const nextStart = startOptions[0] ?? '';
      setSelectedStart(nextStart);
      setSelectedEnd('');
      return;
    }

    if (!endOptions.includes(selectedEnd)) {
      setSelectedEnd(endOptions[0] ?? '');
    }
  }, [selectedDate, startOptions, selectedStart, endOptions, selectedEnd]);

  useEffect(() => {
    if (!selectedDate || !selectedStart || !selectedEnd || !onChange) return;

    onChange({
      date: selectedDate,
      startTime: selectedStart,
      endTime: selectedEnd,
    });
  }, [selectedDate, selectedStart, selectedEnd, onChange]);

  const handleDateSelect = (dateKey: string) => {
    if (disabled) return;

    const date = parseDateKey(dateKey);
    if (!isDateSelectable(date)) return;

    setSelectedDate(dateKey);
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-brand-800 dark:bg-brand-900">
      <div className="border-b border-gray-200 p-5 dark:border-brand-800">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-800/50">
            <CalendarDays className="h-5 w-5 text-brand-600 dark:text-brand-400" />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-gray-900 dark:text-white">
              Choose a moving date
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Only days and times when this mover is available can be selected.
            </p>
          </div>
        </div>
      </div>

      <div className="p-5">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setMonthCursor((current) => addMonths(current, -1))}
            disabled={disabled || !canGoPrevious}
            aria-label="Previous month"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-brand-700 dark:text-gray-300 dark:hover:bg-brand-800"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <div className="text-center">
            <p className="font-semibold text-gray-900 dark:text-white">
              {MONTH_NAMES[monthCursor.getMonth()]} {monthCursor.getFullYear()}
            </p>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {formatTime(timeFromMinutes(dayStart))} – {formatTime(timeFromMinutes(dayEnd))}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setMonthCursor((current) => addMonths(current, 1))}
            disabled={disabled || !canGoNext}
            aria-label="Next month"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-brand-700 dark:text-gray-300 dark:hover:bg-brand-800"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-7 gap-1 text-center">
          {DAY_NAMES.map((day) => (
            <div
              key={day}
              className="py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400"
            >
              {day.slice(0, 3)}
            </div>
          ))}

          {calendarDays.map(({ date, inMonth, key }) => {
            const selectable = inMonth && isDateSelectable(date);
            const selected = key === selectedDate;
            const isToday = key === toDateKey(today);

            return (
              <button
                key={key}
                type="button"
                onClick={() => handleDateSelect(key)}
                disabled={disabled || !selectable}
                aria-label={`${formatDateLabel(key)}${selectable ? '' : ' unavailable'}`}
                className={cn(
                  'relative min-h-10 rounded-lg px-1 py-2 text-sm font-medium transition',
                  !inMonth && 'pointer-events-none opacity-0',
                  selectable && !selected && 'text-gray-800 hover:bg-brand-50 dark:text-gray-200 dark:hover:bg-brand-800',
                  !selectable && inMonth && 'cursor-not-allowed text-gray-300 dark:text-gray-700',
                  selected && 'bg-brand-600 text-white shadow-sm hover:bg-brand-700',
                  isToday && !selected && 'ring-1 ring-inset ring-brand-400',
                )}
              >
                {date.getDate()}
                {selectable && !selected && (
                  <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-brand-500" />
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-5 flex items-start gap-2 rounded-xl bg-gray-50 p-3 text-xs leading-5 text-gray-500 dark:bg-brand-800/30 dark:text-gray-400">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
          <span>
            The mover normally works {formatTime(timeFromMinutes(dayStart))}–{formatTime(timeFromMinutes(dayEnd))}. Already reserved periods are automatically unavailable.
          </span>
        </div>

        {selectedDate && (
          <div className="mt-6 border-t border-gray-200 pt-5 dark:border-brand-800">
            <div className="flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-brand-600 dark:text-brand-400" />
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  Choose your time range
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {formatDateLabel(selectedDate)}
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-300">
                  Start time
                </span>
                <select
                  value={selectedStart}
                  onChange={(event) => {
                    setSelectedStart(event.target.value);
                    setSelectedEnd('');
                  }}
                  disabled={disabled || startOptions.length === 0}
                  className="input-field w-full"
                >
                  {startOptions.length === 0 ? (
                    <option value="">No available start times</option>
                  ) : (
                    startOptions.map((time) => (
                      <option key={time} value={time}>
                        {formatTime(time)}
                      </option>
                    ))
                  )}
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-300">
                  End time
                </span>
                <select
                  value={selectedEnd}
                  onChange={(event) => setSelectedEnd(event.target.value)}
                  disabled={disabled || endOptions.length === 0}
                  className="input-field w-full"
                >
                  {endOptions.length === 0 ? (
                    <option value="">No available end times</option>
                  ) : (
                    endOptions.map((time) => (
                      <option key={time} value={time}>
                        {formatTime(time)}
                      </option>
                    ))
                  )}
                </select>
              </label>
            </div>

            {selectedStart && selectedEnd && (
              <div className="mt-4 rounded-xl border border-brand-200 bg-brand-50 p-4 dark:border-brand-700 dark:bg-brand-800/30">
                <p className="text-xs font-medium uppercase tracking-wide text-brand-700 dark:text-brand-300">
                  Requested window
                </p>
                <p className="mt-1 text-sm font-bold text-brand-900 dark:text-brand-100">
                  {formatTime(selectedStart)} – {formatTime(selectedEnd)}
                </p>
                <p className="mt-1 text-xs text-brand-700 dark:text-brand-300">
                  This is a request. The mover must accept it before the booking is confirmed.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
