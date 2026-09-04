import { useMemo, useState } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import '@/pages/calendarIndex.css';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import type { MoverScheduleEvent } from '@/lib/Movers/moverApi';

interface Props { schedule: MoverScheduleEvent[]; onOpen: (bookingId: string) => void }

const dayKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const eventStatus = (status: string | null | undefined) => String(status ?? '').trim().toUpperCase();

export default function MoverCalendar({ schedule, onOpen }: Props) {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [month, setMonth] = useState<Date>(new Date());

  const monthDays = useMemo(() => {
    const start = new Date(month.getFullYear(), month.getMonth(), 1);
    const end = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    const leading = (start.getDay() + 6) % 7;
    return Array.from({ length: leading + end.getDate() }, (_, index) => {
      if (index < leading) return null;
      return new Date(month.getFullYear(), month.getMonth(), index - leading + 1);
    });
  }, [month]);

  const eventsForDate = useMemo(() => schedule.filter((event) => {
    const status = eventStatus(event.status);
    return ['TENTATIVE', 'CONFIRMED'].includes(status) && dayKey(new Date(event.starts_at)) === dayKey(selectedDate);
  }), [schedule, selectedDate]);

  const selectDate = (date: Date) => {
    setSelectedDate(date);
    setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
  };

  const changeMonth = (offset: number) => {
    const next = new Date(month.getFullYear(), month.getMonth() + offset, 1);
    setMonth(next);
    if (selectedDate.getMonth() !== next.getMonth() || selectedDate.getFullYear() !== next.getFullYear()) {
      setSelectedDate(next);
    }
  };

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-bold text-gray-900 dark:text-white">Mover calendar</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">View scheduled moving jobs by date.</p>
        </div>
        <CalendarDays className="h-5 w-5 text-brand-600 dark:text-brand-400" />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[auto_1fr]">
        <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-brand-800 dark:bg-brand-900">
          <DatePicker
            selected={selectedDate}
            onChange={(date) => date && selectDate(date)}
            inline
            calendarClassName="sakakrib-calendar"
            minDate={new Date()}
            renderCustomHeader={({ date, decreaseMonth, increaseMonth, prevMonthButtonDisabled, nextMonthButtonDisabled }) => (
              <div className="flex items-center justify-between px-2 py-1">
                <button type="button" onClick={decreaseMonth} disabled={prevMonthButtonDisabled} aria-label="Previous month" className="rounded-md p-1 hover:bg-brand-200 disabled:opacity-40">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-sm font-semibold text-brand-900 dark:text-white">{date.toLocaleDateString('en-KE', { month: 'long', year: 'numeric' })}</span>
                <button type="button" onClick={increaseMonth} disabled={nextMonthButtonDisabled} aria-label="Next month" className="rounded-md p-1 hover:bg-brand-200 disabled:opacity-40">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          />
        </div>

        <div className="min-w-0">
          <div className="mb-3 grid grid-cols-7 gap-2 text-center text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <span key={day}>{day}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {monthDays.map((date, index) => {
              if (!date) return <div key={`empty-${index}`} className="min-h-16" />;
              const key = dayKey(date);
              const events = schedule.filter((event) => ['TENTATIVE', 'CONFIRMED'].includes(eventStatus(event.status)) && dayKey(new Date(event.starts_at)) === key);
              const selected = key === dayKey(selectedDate);
              return (
                <button key={key} type="button" onClick={() => selectDate(date)} className={`min-h-16 rounded-xl border p-2 text-left transition ${selected ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/30' : 'border-gray-200 bg-white hover:border-brand-300 dark:border-brand-800 dark:bg-brand-900'}`}>
                  <span className="text-sm font-bold text-gray-900 dark:text-white">{date.getDate()}</span>
                  {events.length > 0 && <span className="mt-1 block text-xs font-semibold text-brand-600 dark:text-brand-400">{events.length} job{events.length === 1 ? '' : 's'}</span>}
                </button>
              );
            })}
          </div>

          <div className="mt-5 rounded-xl border border-gray-200 p-4 dark:border-brand-800">
            <div className="flex items-center justify-between gap-3">
              <div><h3 className="font-semibold text-gray-900 dark:text-white">{selectedDate.toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</h3><p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Scheduled jobs</p></div>
              <button type="button" onClick={() => setSelectedDate(new Date())} className="text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400">Today</button>
            </div>
            {eventsForDate.length === 0 ? <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">No scheduled moving jobs for this date.</p> : <div className="mt-4 space-y-2">{eventsForDate.map((event) => <button key={event.id} type="button" onClick={() => onOpen(event.booking_id)} className="w-full rounded-xl bg-brand-50 p-3 text-left hover:bg-brand-100 dark:bg-brand-900/30 dark:hover:bg-brand-900/50"><p className="text-sm font-semibold text-brand-800 dark:text-brand-200">{new Date(event.starts_at).toLocaleTimeString('en-KE', { hour: 'numeric', minute: '2-digit' })} · {event.title || 'Moving job'}</p><p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Ends {new Date(event.ends_at).toLocaleTimeString('en-KE', { hour: 'numeric', minute: '2-digit' })}</p></button>)}</div>}
          </div>
        </div>
      </div>
    </section>
  );
}
