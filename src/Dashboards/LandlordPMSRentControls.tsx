import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Edit3, Loader2, Wallet, X } from 'lucide-react';
import { protectedGet, protectedPost } from '@/lib/djangoApi';

type Unit = {
  unit_id: string;
  listing_id: string;
  listing_title?: string;
  unit_number: string;
  rent: number;
  renter_name?: string | null;
  renter_assoc_id?: string | null;
  rent_due_day?: number;
  rent_paid_in_advance?: boolean;
  rent_paid_through_month?: string | null;
};

type AdvanceRecord = { id: string; period_year: number; period_month: number; amount_kes: number; paid_at?: string | null; note?: string | null };

const money = (value: unknown) => `KES ${Number(value || 0).toLocaleString('en-KE', { maximumFractionDigits: 0 })}`;
const monthStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
const monthLabel = (d: Date) => new Intl.DateTimeFormat('en-KE', { month: 'long', year: 'numeric' }).format(d);

const monthOptions = () => {
  const now = monthStart(new Date());
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    return { value: monthKey(d), label: monthLabel(d) };
  });
};

function PaidThroughModal({ unit, onClose, onSaved }: { unit: Unit; onClose: () => void; onSaved: () => Promise<void> }) {
  const options = monthOptions();
  const [enabled, setEnabled] = useState(Boolean(unit.rent_paid_in_advance));
  const [through, setThrough] = useState(unit.rent_paid_through_month || options[0].value);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!enabled) {
      setError('Tick “Paid in advance” to record a paid-through period.');
      return;
    }
    if (reason.trim().length < 5) {
      setError('Enter a short reason for the manual payment record.');
      return;
    }
    setSaving(true); setError(null);
    try {
      await protectedPost(`/api/core/rent/units/${unit.unit_id}/paid-through/`, {
        paid_through_month: through,
        reason: reason.trim(),
      });
      await onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to record the rent adjustment.');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-brand-950">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-xs font-bold uppercase tracking-wide text-brand-600">Manual rent record</p><h3 className="mt-1 text-xl font-bold text-gray-900 dark:text-white">Record rent paid through</h3><p className="mt-1 text-sm text-gray-500">{unit.listing_title || 'Property'} · Unit {unit.unit_number} · {unit.renter_name || 'No active renter'}</p></div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-brand-900"><X className="h-5 w-5" /></button>
        </div>

        <div className="mt-6 rounded-xl bg-brand-50 p-4 dark:bg-brand-900/30">
          <div className="flex items-center justify-between"><div><p className="text-xs text-gray-500">Monthly rent</p><p className="text-lg font-bold text-gray-900 dark:text-white">{money(unit.rent)}</p></div><Wallet className="h-6 w-6 text-brand-600" /></div>
        </div>

        <label className="mt-5 flex cursor-pointer items-center gap-3 rounded-xl border border-gray-200 p-4 transition hover:border-brand-400 dark:border-brand-800">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4 rounded" />
          <span><span className="block text-sm font-semibold text-gray-900 dark:text-white">Paid in advance</span><span className="block text-xs text-gray-500">Record every billing month from the current month through the selected month.</span></span>
        </label>

        <fieldset disabled={!enabled} className="mt-5 disabled:opacity-50">
          <label className="text-sm font-semibold text-gray-800 dark:text-gray-200">Paid through</label>
          <select value={through} onChange={(e) => setThrough(e.target.value)} className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-3 py-3 text-sm dark:border-brand-700 dark:bg-brand-900 dark:text-white">
            {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </fieldset>

        <div className="mt-5">
          <label className="text-sm font-semibold text-gray-800 dark:text-gray-200">Reason / record note</label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Example: Renter paid four months ahead directly to the landlord." className="mt-2 w-full resize-none rounded-xl border border-gray-300 bg-white px-3 py-3 text-sm outline-none focus:border-brand-500 dark:border-brand-700 dark:bg-brand-900 dark:text-white" />
        </div>

        {unit.rent_paid_in_advance && <p className="mt-4 rounded-xl bg-success-50 px-3 py-2 text-xs text-success-700 dark:bg-success-900/20 dark:text-success-300">Current record: paid through {unit.rent_paid_through_month ? new Intl.DateTimeFormat('en-KE', { month: 'long', year: 'numeric' }).format(new Date(unit.rent_paid_through_month)) : 'a recorded period'}.</p>}
        {error && <p className="mt-4 rounded-xl bg-error-50 px-3 py-2 text-sm text-error-700 dark:bg-error-900/20 dark:text-error-300">{error}</p>}
        <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={onClose} className="btn-secondary">Cancel</button><button type="button" onClick={() => void submit()} disabled={saving || !enabled} className="btn-primary inline-flex items-center gap-2">{saving && <Loader2 className="h-4 w-4 animate-spin" />}Save payment record</button></div>
      </div>
    </div>
  );
}

export default function LandlordPMSRentControls() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [history, setHistory] = useState<AdvanceRecord[]>([]);
  const [selected, setSelected] = useState<Unit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(monthStart(new Date()));

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const rows = await protectedGet<Unit[]>('/api/core/rent/units/');
      const next = Array.isArray(rows) ? rows : [];
      setUnits(next);
      const paidUnits = next.filter((u) => u.rent_paid_in_advance).slice(0, 8);
      const records = await Promise.all(paidUnits.map(async (u) => {
        try {
          const detail = await protectedGet<{ advance_records?: AdvanceRecord[] }>(`/api/core/rent/units/${u.unit_id}/paid-through/`);
          return Array.isArray(detail.advance_records) ? detail.advance_records : [];
        } catch { return []; }
      }));
      setHistory(records.flat());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load Django rent controls.');
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const calendar = useMemo(() => {
    const first = monthStart(calendarMonth);
    const cells: Array<Date | null> = Array.from({ length: first.getDay() }, () => null);
    const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    for (let day = 1; day <= days; day += 1) cells.push(new Date(first.getFullYear(), first.getMonth(), day));
    while (cells.length % 7) cells.push(null);
    return cells;
  }, [calendarMonth]);

  const dueOn = (day: number) => units.filter((u) => Number(u.rent_due_day || 1) === day && u.renter_assoc_id);
  const activeUnits = units.filter((u) => u.renter_assoc_id);
  const paidAhead = activeUnits.filter((u) => u.rent_paid_in_advance);
  const totalMonthlyRent = activeUnits.reduce((sum, u) => sum + Number(u.rent || 0), 0);

  if (loading) return <div className="mt-6 flex min-h-40 items-center justify-center rounded-2xl border border-gray-200 bg-white dark:border-brand-800 dark:bg-brand-950"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div>;

  return (
    <section className="mt-6 space-y-6">
      <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-brand-800 dark:bg-brand-950">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-600">Django rent controls</p><h2 className="mt-1 text-xl font-bold text-gray-900 dark:text-white">Rent schedule & manual payment records</h2><p className="mt-1 max-w-3xl text-sm text-gray-500">Use a unit's rent record when a renter paid directly outside an SakaKrib invoice. Django records each covered month so future invoices and rent status remain consistent.</p></div>
          <button type="button" onClick={() => void load()} className="btn-secondary inline-flex items-center gap-2"><Clock3 className="h-4 w-4" />Refresh</button>
        </div>
      </div>

      {error && <div className="rounded-xl bg-error-50 px-4 py-3 text-sm text-error-700 dark:bg-error-900/20 dark:text-error-300">{error}</div>}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-800 dark:bg-brand-950 lg:col-span-2">
          <div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-wide text-gray-500">Rent calendar</p><h3 className="mt-1 font-bold text-gray-900 dark:text-white">{monthLabel(calendarMonth)}</h3></div><div className="flex gap-1"><button type="button" aria-label="Previous month" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))} className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-brand-900"><ChevronLeft className="h-4 w-4" /></button><button type="button" aria-label="Next month" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))} className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-brand-900"><ChevronRight className="h-4 w-4" /></button></div></div>
          <div className="mt-5 grid grid-cols-7 gap-1 text-center text-[11px] font-bold uppercase tracking-wide text-gray-400">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((day) => <div key={day} className="py-2">{day}</div>)}</div>
          <div className="grid grid-cols-7 gap-1">
            {calendar.map((cell, index) => {
              const due = cell ? dueOn(cell.getDate()) : [];
              return <div key={cell ? cell.toISOString() : `empty-${index}`} className={`min-h-20 rounded-lg border p-1.5 ${cell ? 'border-gray-100 bg-white dark:border-brand-800 dark:bg-brand-900/20' : 'border-transparent'}`}>
                {cell && <><p className="text-right text-xs font-semibold text-gray-500">{cell.getDate()}</p><div className="mt-1 space-y-1">{due.slice(0, 2).map((unit) => { const through = unit.rent_paid_through_month ? monthStart(new Date(unit.rent_paid_through_month)) : null; const paid = through ? cell.getFullYear() * 12 + cell.getMonth() <= through.getFullYear() * 12 + through.getMonth() : false; return <button type="button" key={unit.unit_id} onClick={() => setSelected(unit)} className={`block w-full truncate rounded-md px-1.5 py-1 text-left text-[10px] font-semibold ${paid ? 'bg-success-50 text-success-700 dark:bg-success-900/30 dark:text-success-300' : 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200'}`}>{paid ? 'Paid' : 'Due'} · Unit {unit.unit_number}</button>; })}{due.length > 2 && <p className="text-[10px] text-gray-400">+{due.length - 2} more</p>}</div></>}
              </div>;
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-brand-800 dark:bg-brand-950">
          <div className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-brand-600" /><h3 className="font-bold text-gray-900 dark:text-white">Calendar & rent stats</h3></div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-gray-50 p-3 dark:bg-brand-900/50"><p className="text-xs text-gray-500">Active units</p><p className="mt-1 text-xl font-bold">{activeUnits.length}</p></div>
            <div className="rounded-xl bg-gray-50 p-3 dark:bg-brand-900/50"><p className="text-xs text-gray-500">Paid in advance</p><p className="mt-1 text-xl font-bold">{paidAhead.length}</p></div>
            <div className="rounded-xl bg-gray-50 p-3 dark:bg-brand-900/50"><p className="text-xs text-gray-500">Monthly rent</p><p className="mt-1 text-sm font-bold">{money(totalMonthlyRent)}</p></div>
            <div className="rounded-xl bg-gray-50 p-3 dark:bg-brand-900/50"><p className="text-xs text-gray-500">Advance records</p><p className="mt-1 text-xl font-bold">{history.length}</p></div>
          </div>
          <div className="mt-5 rounded-xl border border-gray-100 p-4 dark:border-brand-800"><p className="text-xs font-semibold text-gray-500">Calendar key</p><div className="mt-2 space-y-2 text-xs"><p><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-success-500" />Paid through selected month</p><p><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-brand-500" />Rent due</p></div></div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-brand-800 dark:bg-brand-950">
        <div className="border-b border-gray-100 p-5 dark:border-brand-800"><h3 className="font-bold text-gray-900 dark:text-white">Units & payment status</h3><p className="mt-1 text-sm text-gray-500">Select a unit to record rent paid outside the normal invoice and transaction-ID workflow.</p></div>
        <div className="divide-y divide-gray-100 dark:divide-brand-800">
          {activeUnits.map((unit) => <div key={unit.unit_id} className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-gray-900 dark:text-white">{unit.listing_title || 'Property'} · Unit {unit.unit_number}</p>{unit.rent_paid_in_advance && <span className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2.5 py-1 text-[10px] font-bold text-success-700 dark:bg-success-900/20 dark:text-success-300"><CheckCircle2 className="h-3 w-3" />Paid through {unit.rent_paid_through_month ? new Intl.DateTimeFormat('en-KE', { month: 'short', year: 'numeric' }).format(new Date(unit.rent_paid_through_month)) : 'recorded'}</span>}</div><p className="mt-1 text-sm text-gray-500">{unit.renter_name} · {money(unit.rent)} / month · due day {unit.rent_due_day || 1}</p></div><button type="button" onClick={() => setSelected(unit)} className="btn-secondary inline-flex items-center justify-center gap-2 px-3 py-2 text-xs"><Edit3 className="h-3.5 w-3.5" />Manage payment status</button></div>)}
          {!activeUnits.length && <div className="p-8 text-center text-sm text-gray-500">No active renter/unit associations are available.</div>}
        </div>
      </div>

      {selected && <PaidThroughModal unit={selected} onClose={() => setSelected(null)} onSaved={load} />}
    </section>
  );
}
