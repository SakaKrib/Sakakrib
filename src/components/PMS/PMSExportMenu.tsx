import { useRef, useState } from 'react';
import { Download, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { protectedBlob } from '@/lib/djangoApi';
import Select from '@/components/ui/Select';

type Kind = 'invoices' | 'payments' | 'tenants' | 'units';
const KINDS: Array<{ value: Kind; label: string }> = [
  { value: 'invoices', label: 'All rent invoices' },
  { value: 'payments', label: 'Rent collected (paid)' },
  { value: 'tenants', label: 'Tenants & leases' },
  { value: 'units', label: 'Units & occupancy' },
];

/** Downloads a CSV or PDF of the owner's records from /api/core/pms/export/. */
export default function PMSExportMenu({ className = '' }: { className?: string }) {
  const [kind, setKind] = useState<Kind>('invoices');
  const [busy, setBusy] = useState<'csv' | 'pdf' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const linkRef = useRef<HTMLAnchorElement>(null);

  const download = async (format: 'csv' | 'pdf') => {
    setBusy(format); setError(null);
    try {
      const blob = await protectedBlob(`/api/core/pms/export/?kind=${kind}&format=${format}`);
      const url = URL.createObjectURL(blob);
      const anchor = linkRef.current;
      if (anchor) {
        anchor.href = url;
        anchor.download = `saka-krib-${kind}-${new Date().toISOString().slice(0, 10)}.${format}`;
        anchor.click();
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to export right now.');
    } finally { setBusy(null); }
  };

  return (
    <div className={`rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-brand-800 dark:bg-brand-950 ${className}`}>
      <div className="flex items-center gap-2"><Download className="h-4 w-4 text-brand-600" /><h3 className="text-sm font-bold text-gray-900 dark:text-white">Export records</h3></div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1"><Select value={kind} onChange={(e) => setKind(e.target.value as Kind)} aria-label="What to export">{KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</Select></div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <button type="button" disabled={busy !== null} onClick={() => void download('csv')} className="btn-secondary px-4">{busy === 'csv' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}CSV</button>
          <button type="button" disabled={busy !== null} onClick={() => void download('pdf')} className="btn-secondary px-4">{busy === 'pdf' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}PDF</button>
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-error-600 dark:text-error-400">{error}</p>}
      <a ref={linkRef} className="hidden" aria-hidden="true" tabIndex={-1}>download</a>
    </div>
  );
}
