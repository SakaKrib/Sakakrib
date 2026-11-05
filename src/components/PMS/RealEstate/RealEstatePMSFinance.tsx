import { useCallback, useEffect, useState } from 'react';
import { FileText, Loader2, RefreshCw, WalletCards } from 'lucide-react';
import { getRealEstatePMSFinance, type RealEstatePMSFinanceData, createRealEstatePMSInvoice } from '@/lib/RealEstateTs/RealEstatePMSFinanceService';
import { getRealEstatePMSUnits, type RealEstatePMSUnit } from '@/lib/RealEstateTs/RealEstatePMSOperationsService';

import Select from '@/components/ui/Select';
interface Props {
  canCreateInvoices: boolean;
}

const kes = (value: number) => `KES ${Number(value || 0).toLocaleString('en-KE')}`;

export default function RealEstatePMSFinance({ canCreateInvoices }: Props) {
  const [data, setData] = useState<RealEstatePMSFinanceData | null>(null);
  const [units, setUnits] = useState<RealEstatePMSUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedUnit, setSelectedUnit] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [financeResult, unitsResult] = await Promise.all([getRealEstatePMSFinance(), getRealEstatePMSUnits()]);
      setData(financeResult.data ?? null);
      const nextUnits = unitsResult.data ?? [];
      setUnits(nextUnits);
      setSelectedUnit((current) => current || nextUnits[0]?.unit_id || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load finance records.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const issueInvoice = async () => {
    const unit = units.find((item) => item.unit_id === selectedUnit);
    if (!unit) return;
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    setSaving(true);
    setError(null);
    try {
      await createRealEstatePMSInvoice({
        unit_id: unit.unit_id,
        amount_kes: unit.rent,
        billing_period_start: start.toISOString().slice(0, 10),
        billing_period_end: end.toISOString().slice(0, 10),
        due_date: new Date(now.getFullYear(), now.getMonth(), Math.min(5, end.getDate())).toISOString().slice(0, 10),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create invoice.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-12 text-sm text-gray-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading finance...</div>;

  return (
    <div className="space-y-5">
      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">{error}</div>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border bg-white p-5 dark:border-brand-700 dark:bg-brand-900"><p className="text-xs text-gray-500">Invoiced</p><p className="mt-1 text-xl font-bold">{kes(data?.summary.total_invoiced_kes ?? 0)}</p></div>
        <div className="rounded-xl border bg-white p-5 dark:border-brand-700 dark:bg-brand-900"><p className="text-xs text-gray-500">Paid</p><p className="mt-1 text-xl font-bold">{kes(data?.summary.total_paid_kes ?? 0)}</p></div>
        <div className="rounded-xl border bg-white p-5 dark:border-brand-700 dark:bg-brand-900"><p className="text-xs text-gray-500">Outstanding</p><p className="mt-1 text-xl font-bold">{kes(data?.summary.total_due_kes ?? 0)}</p></div>
        <div className="rounded-xl border bg-white p-5 dark:border-brand-700 dark:bg-brand-900"><p className="text-xs text-gray-500">Pending submissions</p><p className="mt-1 text-xl font-bold">{data?.summary.pending_submissions ?? 0}</p></div>
      </div>

      {canCreateInvoices && units.length > 0 && <section className="rounded-xl border bg-white p-5 dark:border-brand-700 dark:bg-brand-900"><div className="flex items-center gap-2"><WalletCards className="h-5 w-5 text-brand-600" /><h2 className="font-bold">Create rent invoice</h2></div><div className="mt-4 flex flex-col gap-3 sm:flex-row"><Select value={selectedUnit} onChange={(event) => setSelectedUnit(event.target.value)} className="flex-1 rounded-lg border px-3 py-2 text-sm dark:border-brand-700 dark:bg-brand-950">{units.map((unit) => <option key={unit.unit_id} value={unit.unit_id}>{unit.listing_title} · Unit {unit.unit_number} · {unit.renter_name ?? 'Vacant'}</option>)}</Select><button type="button" onClick={() => void issueInvoice()} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}Issue current invoice</button></div></section>}

      <section className="rounded-xl border bg-white dark:border-brand-700 dark:bg-brand-900"><div className="flex items-center justify-between border-b p-5 dark:border-brand-800"><div><h2 className="font-bold">Invoice history</h2><p className="text-xs text-gray-500 dark:text-gray-400">Recorded rent invoices for the PMS portfolio.</p></div><button type="button" onClick={() => void load()} className="rounded-lg border p-2 dark:border-brand-700" aria-label="Refresh finance"><RefreshCw className="h-4 w-4" /></button></div><div className="divide-y dark:divide-brand-800">{(data?.invoices ?? []).length === 0 ? <p className="p-6 text-sm text-gray-500">No rent invoices recorded yet.</p> : (data?.invoices ?? []).map((invoice) => <div key={invoice.id} className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">{invoice.invoice_number}</p><p className="text-xs text-gray-500">Due {invoice.due_date} · Unit {invoice.unit_id}</p></div><div className="text-left sm:text-right"><p className="font-bold">{kes(invoice.amount_kes)}</p><p className="text-xs font-semibold uppercase text-gray-500">{invoice.status}</p></div></div>)}</div></section>
    </div>
  );
}
