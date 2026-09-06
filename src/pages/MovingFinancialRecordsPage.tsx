import { FileText, RefreshCw, WalletCards } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useNav } from '@/context/NavContext';
import { movingFinancialApi, type MovingFinancialDocument } from '@/lib/movingFinancialApi';

const money = (value: number | null | undefined) => `KES ${(value ?? 0).toLocaleString()}`;
const date = (value: string | null | undefined) => value ? new Date(value).toLocaleString() : '—';

function statusLabel(status: string) {
  return status.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function MovingFinancialRecordsPage() {
  const { profile } = useAuth();
  const { navigate } = useNav();
  const [documents, setDocuments] = useState<MovingFinancialDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    setError(null);
    try {
      setDocuments(await movingFinancialApi.getDocuments());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load financial records.');
    } finally {
      setLoading(false);
    }
  }, [profile?.id]);

  useEffect(() => { void load(); }, [load]);

  const summary = useMemo(() => ({
    receipts: documents.filter((d) => d.document_type === 'RENTER_RECEIPT').length,
    settlements: documents.filter((d) => d.document_type === 'MOVER_SETTLEMENT').length,
    value: documents.reduce((sum, d) => sum + Number(d.amount_kes || 0), 0),
  }), [documents]);

  const isMover = profile?.role === 'mover';
  const title = isMover ? 'Financial records & settlements' : 'Payments & receipts';
  const description = isMover
    ? 'Track your booking settlements, platform deductions, payout status and provider references.'
    : 'Track your moving payments and the receipts issued for confirmed transactions.';

  if (loading) return <div className="flex min-h-[400px] items-center justify-center"><RefreshCw className="h-7 w-7 animate-spin text-brand-500" /></div>;

  return (
    <div className="mx-auto max-w-7xl px-3 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <button type="button" onClick={() => navigate('dashboard')} className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">← Back to dashboard</button>
          <h1 className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{title}</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>
        </div>
        <button type="button" onClick={() => void load()} className="btn-secondary inline-flex items-center gap-2 text-sm"><RefreshCw className="h-4 w-4" />Refresh</button>
      </div>

      {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">{error}</div>}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="card p-5"><p className="text-sm text-gray-500 dark:text-gray-400">Receipts</p><p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{summary.receipts}</p></div>
        <div className="card p-5"><p className="text-sm text-gray-500 dark:text-gray-400">Settlements</p><p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{summary.settlements}</p></div>
        <div className="card p-5"><p className="text-sm text-gray-500 dark:text-gray-400">Transaction value</p><p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{money(summary.value)}</p></div>
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-gray-100 p-5 dark:border-brand-800"><h2 className="font-bold text-gray-900 dark:text-white">Moving transaction records</h2></div>
        {documents.length === 0 ? (
          <div className="p-10 text-center"><WalletCards className="mx-auto h-9 w-9 text-gray-400" /><p className="mt-3 text-sm text-gray-500 dark:text-gray-400">No moving financial records yet.</p></div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-brand-800">
            {documents.map((document) => (
              <div key={document.id} className="p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <FileText className="h-4 w-4 text-brand-500" />
                      <p className="font-semibold text-gray-900 dark:text-white">{document.document_number}</p>
                      <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 dark:bg-brand-900 dark:text-gray-300">{statusLabel(document.status)}</span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{document.document_type === 'RENTER_RECEIPT' ? 'Renter receipt' : 'Mover settlement'} · Booking {document.booking_id.slice(0, 8)} · Issued {date(document.issued_at)}</p>
                  </div>
                  <div className="lg:text-right"><p className="text-lg font-bold text-gray-900 dark:text-white">{money(document.amount_kes)}</p><p className="text-xs text-gray-500 dark:text-gray-400">{document.payment_provider || 'Provider pending'}</p></div>
                </div>

                <div className="mt-4 grid gap-3 rounded-xl bg-gray-50 p-4 text-sm dark:bg-brand-950/50 sm:grid-cols-2 lg:grid-cols-4">
                  <div><p className="text-xs text-gray-500 dark:text-gray-400">Platform fee</p><p className="font-medium text-gray-900 dark:text-white">{money(document.platform_fee_kes)}</p></div>
                  <div><p className="text-xs text-gray-500 dark:text-gray-400">Mover net</p><p className="font-medium text-gray-900 dark:text-white">{money(document.mover_net_kes)}</p></div>
                  <div><p className="text-xs text-gray-500 dark:text-gray-400">Provider reference</p><p className="break-all font-medium text-gray-900 dark:text-white">{document.provider_reference || '—'}</p></div>
                  <div><p className="text-xs text-gray-500 dark:text-gray-400">Provider transaction</p><p className="break-all font-medium text-gray-900 dark:text-white">{document.provider_transaction_id || '—'}</p></div>
                </div>

                {isMover && document.document_type === 'MOVER_SETTLEMENT' && (
                  <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">Released: {date(document.released_at)} · Payment confirmed: {date(document.paid_at)}</div>
                )}
                {!isMover && document.document_type === 'RENTER_RECEIPT' && (
                  <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">Payment confirmed: {date(document.paid_at)} · Escrow/release recorded: {date(document.released_at)}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
