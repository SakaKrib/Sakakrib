import { useEffect, useState } from 'react';
import { CheckCircle2, Clock3, Loader2, RefreshCw, UserRound, XCircle } from 'lucide-react';
import { protectedGet, protectedPost } from '@/lib/djangoApi';

type RequestRow = {
  id: string;
  unit_id: string;
  unit_number?: string | null;
  listing_title?: string;
  renter_name: string;
  renter_email: string | null;
  renter_phone: string | null;
  rent_amount: number | string;
  created_at: string;
  expires_at: string | null;
};

const money = (v: unknown) => `KES ${Number(v || 0).toLocaleString('en-KE', { maximumFractionDigits: 0 })}`;

export default function LandlordPMSRentalRequests() {
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [replies, setReplies] = useState<Record<string, string>>({});

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    if (!silent) setError(null);
    try {
      setRows(await protectedGet<RequestRow[]>('/api/core/pms/requests/'));
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : 'Unable to load rental requests.');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Near real-time: poll while visible, refresh on focus and whenever a push arrives.
  useEffect(() => {
    void load();
    const refresh = () => { if (document.visibilityState === 'visible') void load(true); };
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('sakakrib:push', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('sakakrib:push', refresh);
    };
  }, []);

  const respond = async (row: RequestRow, action: 'accept' | 'decline') => {
    setBusy(`${action}-${row.id}`);
    setError(null);
    setNotice(null);
    try {
      await protectedPost(`/api/core/pms/requests/${row.id}/respond/`, { action, message: replies[row.id] || '' });
      setNotice(action === 'accept' ? 'Rental request accepted and the unit is now occupied.' : 'Rental request declined.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to process the rental request.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-brand-800 dark:bg-brand-950">
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 p-5 dark:border-brand-800">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-600">Rental requests</p>
          <h3 className="mt-1 text-lg font-bold text-gray-900 dark:text-white">Renter requests for vacant units</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">New requests appear here automatically and you are notified by push. Accept or decline, with an optional reply to the renter.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="rounded-xl border border-gray-200 p-2 text-gray-500 hover:bg-gray-50 disabled:opacity-50 dark:border-brand-800 dark:hover:bg-brand-900" aria-label="Refresh rental requests">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && <div className="mx-5 mt-4 rounded-xl bg-error-50 px-3 py-2 text-sm text-error-700 dark:bg-error-900/20 dark:text-error-300">{error}</div>}
      {notice && <div className="mx-5 mt-4 rounded-xl bg-success-50 px-3 py-2 text-sm text-success-700 dark:bg-success-900/20 dark:text-success-300">{notice}</div>}

      {loading && !rows.length ? (
        <div className="flex min-h-32 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div>
      ) : !rows.length ? (
        <div className="p-8 text-center"><Clock3 className="mx-auto h-8 w-8 text-gray-300" /><p className="mt-2 text-sm text-gray-500">No pending renter requests.</p></div>
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-brand-800">
          {rows.map((row) => (
            <div key={row.id} className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300"><UserRound className="h-5 w-5" /></span>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">{row.renter_name}</p>
                  <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{row.renter_email || 'No email'}{row.renter_phone ? ` · ${row.renter_phone}` : ''}</p>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{row.listing_title ? `${row.listing_title} · ` : ''}Unit {row.unit_number || '—'} · {money(row.rent_amount)} / month</p>
                  <p className="mt-1 text-xs text-gray-400">Requested {new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium' }).format(new Date(row.created_at))}</p>
                </div>
              </div>
              <div className="flex flex-col gap-2 lg:w-72 lg:shrink-0">
                <input value={replies[row.id] || ''} onChange={(e) => setReplies({ ...replies, [row.id]: e.target.value })} maxLength={500} placeholder="Optional reply to the renter" className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand-500 dark:border-brand-700 dark:bg-brand-950 dark:text-white" />
                <div className="flex gap-2">
                <button type="button" disabled={busy !== null} onClick={() => void respond(row, 'accept')} className="btn-primary inline-flex items-center gap-2 px-3 py-2 text-xs disabled:opacity-50">
                  {busy === `accept-${row.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Accept
                </button>
                <button type="button" disabled={busy !== null} onClick={() => void respond(row, 'decline')} className="btn-secondary inline-flex items-center gap-2 px-3 py-2 text-xs text-error-600 disabled:opacity-50">
                  {busy === `decline-${row.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />} Decline
                </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
