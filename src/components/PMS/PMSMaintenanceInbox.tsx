import { useCallback, useEffect, useState } from 'react';
import { Loader2, Wrench } from 'lucide-react';

import Select from '@/components/ui/Select';
import { protectedGet, protectedPatch } from '@/lib/djangoApi';

interface Item { id: string; unit_number: string | null; listing_title: string; renter_name: string; title: string; description: string; category: string; priority: string; status: string; response_note: string; assigned_name: string; assigned_phone: string; created_at: string }
const inputClass = 'w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand-500 dark:border-brand-700 dark:bg-brand-950 dark:text-white';
const STATUS_STYLE: Record<string, string> = {
  OPEN: 'bg-warning-50 text-warning-700 dark:bg-warning-900/20 dark:text-warning-300',
  IN_PROGRESS: 'bg-brand-50 text-brand-700 dark:bg-brand-800 dark:text-brand-200',
  RESOLVED: 'bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300',
  CLOSED: 'bg-gray-100 text-gray-600 dark:bg-brand-800 dark:text-gray-300',
};

/** Maintenance inbox shared by the landlord and real-estate PMS. Refreshes live and on push. */
export default function PMSMaintenanceInbox({ canManage = true }: { canManage?: boolean }) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'active' | 'all'>('active');
  const [drafts, setDrafts] = useState<Record<string, { note: string; name: string; phone: string }>>({});

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try { setItems(await protectedGet<Item[]>('/api/core/pms/maintenance/')); if (!silent) setError(null); }
    catch (err) { if (!silent) setError(err instanceof Error ? err.message : 'Unable to load maintenance requests.'); }
    finally { if (!silent) setLoading(false); }
  }, []);

  useEffect(() => {
    void load();
    const refresh = () => { if (document.visibilityState === 'visible') void load(true); };
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener('sakakrib:push', refresh);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('sakakrib:push', refresh); window.removeEventListener('focus', refresh); };
  }, [load]);

  const update = async (item: Item, status: string) => {
    const draft = drafts[item.id] ?? { note: '', name: item.assigned_name, phone: item.assigned_phone };
    setBusy(item.id);
    setError(null);
    try {
      const saved = await protectedPatch<Item>(`/api/core/pms/maintenance/${item.id}/`, { status, response_note: draft.note || item.response_note, assigned_name: draft.name, assigned_phone: draft.phone });
      setItems((current) => current.map((row) => row.id === item.id ? { ...row, ...saved, renter_name: row.renter_name } : row));
      setDrafts((current) => { const next = { ...current }; delete next[item.id]; return next; });
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to update the request.'); }
    finally { setBusy(null); }
  };

  const shown = items.filter((item) => filter === 'all' || ['OPEN', 'IN_PROGRESS'].includes(item.status));
  const openCount = items.filter((item) => item.status === 'OPEN').length;

  return (
    <section className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-brand-700 dark:bg-brand-900">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 p-5 dark:border-brand-800">
        <div className="flex items-center gap-2"><Wrench className="h-5 w-5 text-brand-600" /><div><h2 className="font-bold text-gray-900 dark:text-white">Maintenance requests{openCount > 0 && <span className="ml-2 rounded-full bg-error-600 px-2 py-0.5 text-[11px] font-bold text-white">{openCount} new</span>}</h2><p className="text-xs text-gray-500 dark:text-gray-400">Problems reported by your renters. Assign someone, update the status and reply.</p></div></div>
        <div className="flex gap-2">{(['active', 'all'] as const).map((key) => <button key={key} type="button" onClick={() => setFilter(key)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${filter === key ? 'bg-brand-600 text-white' : 'border border-gray-200 text-gray-600 dark:border-brand-700 dark:text-gray-300'}`}>{key === 'active' ? 'Active' : 'All'}</button>)}</div>
      </div>
      {error && <p className="m-5 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">{error}</p>}
      <div className="divide-y dark:divide-brand-800">
        {loading ? <div className="flex justify-center py-8 text-sm text-gray-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading...</div>
          : shown.length === 0 ? <p className="p-6 text-sm text-gray-500 dark:text-gray-400">No maintenance requests.</p>
          : shown.map((item) => {
            const draft = drafts[item.id] ?? { note: '', name: item.assigned_name, phone: item.assigned_phone };
            const setDraft = (patch: Partial<typeof draft>) => setDrafts((current) => ({ ...current, [item.id]: { ...draft, ...patch } }));
            return (
              <div key={item.id} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><p className="font-semibold text-gray-900 dark:text-white">{item.priority === 'urgent' && <span className="mr-2 rounded bg-error-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">Urgent</span>}{item.title}</p><p className="text-xs text-gray-500 dark:text-gray-400">{item.listing_title} · Unit {item.unit_number} · {item.renter_name || 'Renter'} · {item.category} · {new Date(item.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}</p></div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase ${STATUS_STYLE[item.status] ?? STATUS_STYLE.OPEN}`}>{item.status.replace('_', ' ')}</span>
                </div>
                {item.description && <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{item.description}</p>}
                {canManage && item.status !== 'CLOSED' && (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <input value={draft.name} onChange={(e) => setDraft({ name: e.target.value })} placeholder="Assign to (caretaker / technician)" className={inputClass} />
                    <input value={draft.phone} onChange={(e) => setDraft({ phone: e.target.value })} placeholder="Their phone" className={inputClass} />
                    <input value={draft.note} onChange={(e) => setDraft({ note: e.target.value })} placeholder={item.response_note || 'Reply to the renter'} className={`${inputClass} sm:col-span-2`} />
                    <div className="flex flex-wrap gap-2 sm:col-span-2">
                      {item.status === 'OPEN' && <button type="button" disabled={busy === item.id} onClick={() => void update(item, 'IN_PROGRESS')} className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Start work</button>}
                      <button type="button" disabled={busy === item.id} onClick={() => void update(item, 'RESOLVED')} className="rounded-lg bg-success-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Mark resolved</button>
                      <button type="button" disabled={busy === item.id} onClick={() => void update(item, item.status)} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 dark:border-brand-700 dark:text-gray-200">Send reply / save</button>
                      {item.status === 'RESOLVED' && <button type="button" disabled={busy === item.id} onClick={() => void update(item, 'CLOSED')} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 dark:border-brand-700 dark:text-gray-200">Close</button>}
                    </div>
                  </div>
                )}
                {item.response_note && <p className="mt-2 text-xs text-gray-500">Last reply: {item.response_note}</p>}
              </div>
            );
          })}
      </div>
    </section>
  );
}
