import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ChevronLeft, Loader2, Wrench } from 'lucide-react';

import Select from '@/components/ui/Select';
import { useNav } from '@/context/NavContext';
import { protectedGet, protectedPost } from '@/lib/djangoApi';

interface MaintenanceItem { id: string; unit_number: string | null; listing_title: string; title: string; description: string; category: string; priority: string; status: string; response_note: string; assigned_name: string; assigned_phone: string; created_at: string }

const CATEGORIES = [['plumbing', 'Plumbing / water'], ['electrical', 'Electrical'], ['security', 'Security / locks'], ['appliance', 'Appliance'], ['structure', 'Walls, roof, doors'], ['pests', 'Pests'], ['internet', 'Internet / TV'], ['other', 'Other']];
const STATUS_STYLE: Record<string, string> = {
  OPEN: 'bg-warning-50 text-warning-700 dark:bg-warning-900/20 dark:text-warning-300',
  IN_PROGRESS: 'bg-brand-50 text-brand-700 dark:bg-brand-800 dark:text-brand-200',
  RESOLVED: 'bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300',
  CLOSED: 'bg-gray-100 text-gray-600 dark:bg-brand-800 dark:text-gray-300',
};
const inputClass = 'w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-brand-500 dark:border-brand-700 dark:bg-brand-950 dark:text-white';

export default function RenterMaintenancePage() {
  const { navigate } = useNav();
  const [items, setItems] = useState<MaintenanceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ title: '', description: '', category: 'plumbing', priority: 'normal' });

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try { setItems(await protectedGet<MaintenanceItem[]>('/api/core/renter/maintenance/')); }
    catch (err) { if (!silent) setError(err instanceof Error ? err.message : 'Unable to load your requests.'); }
    finally { if (!silent) setLoading(false); }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(true); }, 20000);
    window.addEventListener('sakakrib:push', () => void load(true));
    return () => window.clearInterval(timer);
  }, [load]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await protectedPost('/api/core/renter/maintenance/', form);
      setForm({ title: '', description: '', category: form.category, priority: 'normal' });
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send your request.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <button type="button" onClick={() => navigate('dashboard')} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-brand-600 dark:text-brand-300"><ChevronLeft className="h-4 w-4" />Back to dashboard</button>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Maintenance requests</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Report a problem in your home. Your landlord or agent is notified immediately and you will hear back here.</p>

      <form onSubmit={submit} className="card mt-6 grid gap-3 p-5 sm:grid-cols-2">
        <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="What is the problem? *" maxLength={160} className={`${inputClass} sm:col-span-2`} />
        <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputClass}>{CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
        <Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className={inputClass}><option value="low">Low - can wait</option><option value="normal">Normal</option><option value="urgent">Urgent - safety or no water/power</option></Select>
        <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} maxLength={1500} placeholder="Add details (where, since when)" className={`${inputClass} resize-none sm:col-span-2`} />
        {error && <p className="text-sm text-error-600 dark:text-error-400 sm:col-span-2">{error}</p>}
        <button disabled={saving} className="btn-primary inline-flex items-center justify-center gap-2 sm:col-span-2">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}Send request</button>
      </form>

      <div className="mt-6 space-y-3">
        {loading ? <div className="flex justify-center py-8 text-sm text-gray-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading...</div>
          : items.length === 0 ? <p className="card p-6 text-center text-sm text-gray-500 dark:text-gray-400">You have not reported anything yet.</p>
          : items.map((item) => (
            <div key={item.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><p className="font-semibold text-gray-900 dark:text-white">{item.title}</p><p className="text-xs text-gray-500 dark:text-gray-400">{item.listing_title} · Unit {item.unit_number} · {new Date(item.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}{item.priority === 'urgent' ? ' · Urgent' : ''}</p></div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase ${STATUS_STYLE[item.status] ?? STATUS_STYLE.OPEN}`}>{item.status.replace('_', ' ')}</span>
              </div>
              {item.description && <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{item.description}</p>}
              {item.assigned_name && <p className="mt-2 text-xs text-gray-500">Assigned to {item.assigned_name}{item.assigned_phone ? ` · ${item.assigned_phone}` : ''}</p>}
              {item.response_note && <p className="mt-2 rounded-lg bg-gray-50 p-3 text-sm text-gray-700 dark:bg-brand-800 dark:text-gray-200">{item.response_note}</p>}
            </div>
          ))}
      </div>
    </div>
  );
}
